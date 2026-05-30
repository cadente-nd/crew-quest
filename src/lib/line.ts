import { messagingApi } from "@line/bot-sdk";
import { env } from "@/lib/env";

let client: messagingApi.MessagingApiClient | null = null;

function api(): messagingApi.MessagingApiClient {
  if (client) return client;
  client = new messagingApi.MessagingApiClient({ channelAccessToken: env().LINE_MESSAGING_CHANNEL_ACCESS_TOKEN });
  return client;
}

/** Push a text message to one lineUserId. Throws on API error (caller logs). */
export async function pushText(lineUserId: string, text: string): Promise<void> {
  await api().pushMessage({ to: lineUserId, messages: [{ type: "text", text }] });
}

export function topicOpenMessage(title: string, windowMinutes: number, link: string): string {
  return `📸 New topic: ${title} — you've got ${windowMinutes} min!\nOpen the app: ${link}`;
}
