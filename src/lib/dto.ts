import type { EventDoc, TopicDoc } from "@/models";
import type { EventDTO, TopicDTO } from "@/types";

export function eventToDTO(e: EventDoc): EventDTO {
  return {
    id: String(e._id),
    name: e.name,
    joinCode: e.joinCode,
    timezone: e.timezone,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
    status: e.status,
    settings: { allowRetake: e.settings?.allowRetake ?? true },
  };
}

export function topicToDTO(t: TopicDoc): TopicDTO {
  return {
    id: String(t._id),
    eventId: String(t.eventId),
    title: t.title,
    description: t.description ?? undefined,
    scheduledAt: t.scheduledAt.toISOString(),
    closeAt: t.closeAt.toISOString(),
    windowMinutes: t.windowMinutes,
    status: t.status,
    order: t.order,
  };
}
