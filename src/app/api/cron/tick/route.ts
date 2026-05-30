import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { dbConnect } from "@/lib/db";
import { Event, Topic, Player, PushLog } from "@/models";
import { pushText, topicOpenMessage } from "@/lib/line";
import { env } from "@/lib/env";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 60;

function secretOk(req: NextRequest): boolean {
  const expected = env().CRON_SECRET;
  const header = req.headers.get("x-cron-secret") ?? (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function tick(req: NextRequest) {
  if (!secretOk(req)) return fail("forbidden", 401);

  await dbConnect();
  const now = new Date();

  // 1) Open due topics.
  await Topic.updateMany(
    { status: "scheduled", scheduledAt: { $lte: now } },
    { $set: { status: "open" } }
  );

  // 2) Push for opened topics not yet pushed. Claim pushSentAt FIRST to avoid double-send.
  const toPush = await Topic.find({ status: "open", pushSentAt: null, closeAt: { $gt: now } });
  let pushed = 0;
  for (const topic of toPush) {
    const claimed = await Topic.findOneAndUpdate(
      { _id: topic._id, pushSentAt: null },
      { $set: { pushSentAt: now } },
      { new: true }
    );
    if (!claimed) continue; // another tick claimed it

    const ev = await Event.findById(topic.eventId);
    if (!ev) continue;
    const link = env().APP_BASE_URL.replace(/\/$/, "") + `/event/${ev._id}`;
    const players = await Player.find({ eventId: topic.eventId, isBotFriend: true });
    for (const p of players) {
      try {
        await pushText(p.lineUserId, topicOpenMessage(topic.title, topic.windowMinutes, link));
        await PushLog.create({ eventId: ev._id, topicId: topic._id, lineUserId: p.lineUserId, type: "topic_open", success: true });
      } catch (e) {
        await PushLog.create({ eventId: ev._id, topicId: topic._id, lineUserId: p.lineUserId, type: "topic_open", success: false, error: (e as Error).message });
      }
    }
    pushed++;
  }

  // 3) Close expired topics.
  const closed = await Topic.updateMany(
    { status: "open", closeAt: { $lt: now } },
    { $set: { status: "closed" } }
  );

  // 4) Flip events live->ended past endAt (reveal stays manual).
  await Event.updateMany({ status: { $in: ["draft", "live"] }, endAt: { $lt: now } }, { $set: { status: "ended" } });

  return ok({ openedAndPushed: pushed, closed: closed.modifiedCount, at: now.toISOString() });
}

export const GET = tick;
export const POST = tick;
