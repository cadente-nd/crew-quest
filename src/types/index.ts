export type EventStatus = "draft" | "live" | "ended" | "revealed";
export type TopicStatus = "scheduled" | "open" | "closed";

export interface EventDTO {
  id: string;
  name: string;
  joinCode: string;
  timezone: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status: EventStatus;
  settings: { allowRetake: boolean };
}

export interface TopicDTO {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  scheduledAt: string; // ISO UTC
  closeAt: string; // ISO UTC
  windowMinutes: number;
  status: TopicStatus;
  order: number;
}

export interface ActiveTopicDTO {
  topic: TopicDTO | null;
  serverNow: string; // ISO — client computes countdown against closeAt
  alreadySubmitted: boolean;
  completed: number;
  total: number;
}

export interface RevealSubmissionDTO {
  topicId: string;
  topicTitle: string;
  imageUrl: string;
  thumbnailUrl: string;
  displayName: string;
  pictureUrl?: string;
}
