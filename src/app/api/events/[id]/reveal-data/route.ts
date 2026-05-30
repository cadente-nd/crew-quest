import { NextRequest } from "next/server";
import { dbConnect } from "@/lib/db";
import { Event, Topic, Submission, Player } from "@/models";
import { ok, fail } from "@/lib/http";
import type { RevealSubmissionDTO } from "@/types";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();
    const { id } = await params;
    const ev = await Event.findById(id);
    if (!ev) return fail("event not found", 404);

    // GATE: no submission data leaves the server until explicitly revealed.
    if (ev.status !== "revealed") return fail("reveal not started", 403);

    const topics = await Topic.find({ eventId: id }).sort({ order: 1, scheduledAt: 1 });
    const topicTitle = new Map(topics.map((t) => [String(t._id), t.title]));
    const subs = await Submission.find({ eventId: id });
    const players = await Player.find({ eventId: id });
    const nameById = new Map(players.map((p) => [String(p._id), { name: p.displayName, pic: p.pictureUrl }]));

    const items: RevealSubmissionDTO[] = subs.map((s) => {
      const who = nameById.get(String(s.playerId));
      return {
        topicId: String(s.topicId),
        topicTitle: topicTitle.get(String(s.topicId)) ?? "",
        imageUrl: s.imageUrl,
        thumbnailUrl: s.thumbnailUrl,
        displayName: who?.name ?? "Someone",
        pictureUrl: who?.pic || undefined,
      };
    });

    // Order items by topic order for grouped playback.
    const order = new Map(topics.map((t, i) => [String(t._id), i]));
    items.sort((a, b) => (order.get(a.topicId) ?? 0) - (order.get(b.topicId) ?? 0));

    return ok({ eventName: ev.name, items });
  } catch (e) {
    console.error("reveal-data GET", e);
    return fail("internal server error", 500);
  }
}
