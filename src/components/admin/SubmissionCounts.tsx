import type { TopicDTO } from "@/types";

export function SubmissionCounts({
  topics,
  counts,
  players,
}: {
  topics: TopicDTO[];
  counts: Record<string, number>;
  players: number;
}) {
  return (
    <section style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700 }}>Submissions ({players} players)</h2>
      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
        {topics.map((t) => (
          <div key={t.id} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{t.title}</span>
            <strong>{counts[t.id] ?? 0}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
