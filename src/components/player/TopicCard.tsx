"use client";
import { useRouter } from "next/navigation";
import { CountdownRing } from "@/components/ui/CountdownRing";
import { Button } from "@/components/ui/Button";
import { theme } from "@/theme/tokens";
import type { TopicDTO } from "@/types";

export function TopicCard({
  topic,
  eventId,
  alreadySubmitted,
}: {
  topic: TopicDTO;
  eventId: string;
  alreadySubmitted: boolean;
}) {
  const router = useRouter();
  return (
    <div style={{ padding: 24, borderRadius: theme.radius, background: theme.gradients.hero, color: "#fff" }}>
      <p style={{ opacity: 0.9, margin: 0 }}>📸 Current topic</p>
      <h2 style={{ fontSize: 30, fontWeight: 800, margin: "8px 0" }}>{topic.title}</h2>
      {topic.description && <p style={{ opacity: 0.95 }}>{topic.description}</p>}
      <div style={{ margin: "12px 0", background: "rgba(255,255,255,.25)", borderRadius: 16, padding: 12, textAlign: "center" }}>
        <CountdownRing deadline={topic.closeAt} />
        <span style={{ fontSize: 13 }}>left to capture</span>
      </div>
      {alreadySubmitted ? (
        <p style={{ fontWeight: 700 }}>✅ You&apos;ve submitted for this topic!</p>
      ) : (
        <Button onClick={() => router.push(`/event/${eventId}/capture/${topic.id}`)} style={{ background: "#fff", color: "#1A1A2E" }}>
          Take your photo
        </Button>
      )}
    </div>
  );
}
