import { NextRequest } from "next/server";
import { dbConnect } from "@/lib/db";
import { Topic } from "@/models";
import { requireAdmin, AuthError } from "@/lib/auth-guards";
import { pushTopicOpen } from "@/lib/topics";
import { topicToDTO } from "@/lib/dto";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; topicId: string }> },
) {
  try {
    await requireAdmin();
    await dbConnect();
    const { id: eventId, topicId } = await params;
    const now = new Date();

    // Open the topic and reset its window to start now. Atomic + gated on
    // status:"scheduled" so a double-click or racing cron tick can't fire twice.
    // closeAt = now + windowMinutes (read from the topic via the pipeline).
    const topic = await Topic.findOneAndUpdate(
      { _id: topicId, eventId, status: "scheduled" },
      [
        {
          $set: {
            status: "open",
            scheduledAt: now,
            pushSentAt: now,
            closeAt: { $add: [now, { $multiply: ["$windowMinutes", 60000] }] },
          },
        },
      ],
      { new: true },
    );
    if (!topic) return fail("topic not found or not scheduled", 404);

    // Auto-close any other currently-open topic so the fired one is what players see.
    await Topic.updateMany(
      { eventId, status: "open", _id: { $ne: topic._id } },
      { $set: { status: "closed" } },
    );

    await pushTopicOpen(topic);
    return ok(topicToDTO(topic));
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, e.status);
    console.error("topic fire POST", e);
    return fail("internal server error", 500);
  }
}
