import { NextRequest } from "next/server";
import { dbConnect } from "@/lib/db";
import { Event, Topic, Player, Submission } from "@/models";
import { verifyLiffIdToken } from "@/lib/liffVerify";
import { AuthError } from "@/lib/auth-guards";
import { topicToDTO } from "@/lib/dto";
import { ok, fail } from "@/lib/http";
import type { ActiveTopicDTO } from "@/types";

export const runtime = "nodejs";

// Player passes their idToken via header for identity (never trust a raw userId).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();
    const { id } = await params;
    const idToken = req.headers.get("x-line-id-token") ?? "";
    if (!idToken) return fail("missing id token", 401);
    const verified = await verifyLiffIdToken(idToken);

    const ev = await Event.findById(id);
    if (!ev) return fail("event not found", 404);
    const player = await Player.findOne({ eventId: ev._id, lineUserId: verified.sub });
    if (!player) return fail("not joined", 403);

    const now = new Date();
    // Active topic = currently open AND within window (server clock only).
    const active = await Topic.findOne({
      eventId: ev._id,
      status: "open",
      scheduledAt: { $lte: now },
      closeAt: { $gt: now },
    }).sort({ scheduledAt: 1 });

    const total = await Topic.countDocuments({ eventId: ev._id });
    const completed = await Submission.countDocuments({ eventId: ev._id, playerId: player._id });

    let alreadySubmitted = false;
    if (active) {
      alreadySubmitted = !!(await Submission.exists({ topicId: active._id, playerId: player._id }));
    }

    const payload: ActiveTopicDTO = {
      topic: active ? topicToDTO(active) : null,
      serverNow: now.toISOString(),
      alreadySubmitted,
      completed,
      total,
      eventStatus: ev.status,
    };
    return ok(payload);
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, e.status);
    console.error("active-topic GET", e);
    return fail("internal server error", 500);
  }
}
