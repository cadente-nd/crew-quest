import { NextRequest } from "next/server";
import { dbConnect } from "@/lib/db";
import { Event, Topic, Player, Submission } from "@/models";
import { verifyLiffIdToken } from "@/lib/liffVerify";
import { processImage } from "@/lib/images";
import { putObject } from "@/lib/storage";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB cap

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const form = await req.formData();
    const idToken = String(form.get("idToken") ?? "");
    const eventId = String(form.get("eventId") ?? "");
    const topicId = String(form.get("topicId") ?? "");
    const file = form.get("photo");

    if (!idToken || !eventId || !topicId || !(file instanceof Blob)) {
      return fail("missing fields", 400);
    }
    if (file.size > MAX_BYTES) return fail("image too large", 413);

    const verified = await verifyLiffIdToken(idToken);

    const ev = await Event.findById(eventId);
    if (!ev) return fail("event not found", 404);
    const player = await Player.findOne({ eventId, lineUserId: verified.sub });
    if (!player) return fail("not joined", 403);

    const topic = await Topic.findOne({ _id: topicId, eventId });
    if (!topic) return fail("topic not found", 404);

    // SERVER-AUTHORITATIVE window check — never trust the client clock.
    const now = new Date();
    const isOpen = topic.status === "open" && topic.scheduledAt <= now && topic.closeAt > now;
    if (!isOpen) return fail("submission window is closed", 403);

    // Dedup / retake handling.
    const existing = await Submission.findOne({ topicId, playerId: player._id });
    if (existing && !ev.settings?.allowRetake) {
      return fail("already submitted", 409);
    }

    // Process and upload.
    const buf = Buffer.from(await (file as Blob).arrayBuffer());
    const { full, thumb, contentType } = await processImage(buf);
    const ts = now.getTime();
    const base = `events/${eventId}/topics/${topicId}/${player._id}-${ts}`;
    const [imageUrl, thumbnailUrl] = await Promise.all([
      putObject(`${base}.jpg`, full, contentType),
      putObject(`${base}-thumb.jpg`, thumb, contentType),
    ]);

    if (existing) {
      existing.imageUrl = imageUrl;
      existing.thumbnailUrl = thumbnailUrl;
      existing.capturedAt = now;
      await existing.save();
      return ok({ submissionId: String(existing._id), retake: true });
    }

    try {
      const created = await Submission.create({
        eventId,
        topicId,
        playerId: player._id,
        lineUserId: verified.sub,
        mediaType: "image",
        imageUrl,
        thumbnailUrl,
        capturedAt: now,
      });
      return ok({ submissionId: String(created._id), retake: false }, 201);
    } catch (e) {
      // Unique index (topicId, playerId) → concurrent duplicate.
      if ((e as { code?: number }).code === 11000) return fail("already submitted", 409);
      throw e;
    }
  } catch (e) {
    console.error("submissions POST", e);
    return fail("internal server error", 500);
  }
}
