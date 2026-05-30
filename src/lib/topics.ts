import { Event, Player, PushLog, type TopicDoc } from "@/models";
import { pushText, topicOpenMessage } from "@/lib/line";
import { env } from "@/lib/env";

/**
 * Send the "topic open" push to every bot-friend player in the topic's event,
 * writing a PushLog row per recipient. Shared by the cron tick and the manual
 * "fire now" action. The caller is responsible for opening the topic (setting
 * status/pushSentAt) and for ensuring a DB connection is established.
 */
export async function pushTopicOpen(topic: TopicDoc): Promise<void> {
  const ev = await Event.findById(topic.eventId);
  if (!ev) return;
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
}
