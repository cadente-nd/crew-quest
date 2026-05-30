"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { TopicDTO } from "@/types";

export function TopicScheduler({ eventId, topics }: { eventId: string; topics: TopicDTO[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [firingId, setFiringId] = useState<string | null>(null);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const f = new FormData(e.currentTarget);
    const formEl = e.currentTarget;
    try {
      const res = await fetch(`/api/events/${eventId}/topics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: f.get("title"),
          description: f.get("description") || undefined,
          scheduledAtLocal: f.get("scheduledAtLocal"),
          windowMinutes: Number(f.get("windowMinutes")),
          order: topics.length,
        }),
      });
      const json = await res.json();
      if (json.ok) {
        formEl.reset();
        router.refresh();
      } else setErr(json.error);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function fireNow(topicId: string) {
    if (!confirm("Fire this topic now? Players will be notified immediately.")) return;
    setFiringId(topicId);
    setErr("");
    try {
      const res = await fetch(`/api/events/${eventId}/topics/${topicId}/fire`, { method: "POST" });
      const json = await res.json();
      if (json.ok) router.refresh();
      else setErr(json.error || "Failed to fire topic");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setFiringId(null);
    }
  }

  const field = { padding: 10, borderRadius: 10, border: "1px solid #DDD", fontSize: 15 } as const;
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700 }}>Topics</h2>
      <div style={{ display: "grid", gap: 8 }}>
        {topics.map((t) => (
          <div
            key={t.id}
            style={{ padding: 12, borderRadius: 12, background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
          >
            <span>
              <strong>{t.title}</strong> — {new Date(t.scheduledAt).toLocaleString()} · {t.windowMinutes}m · {t.status}
            </span>
            {t.status === "scheduled" && (
              <Button
                onClick={() => fireNow(t.id)}
                disabled={firingId === t.id}
                style={{ width: "auto", flexShrink: 0, padding: "8px 14px", fontSize: 14 }}
              >
                {firingId === t.id ? "Firing…" : "🔥 Fire now"}
              </Button>
            )}
          </div>
        ))}
      </div>
      <form onSubmit={add} style={{ display: "grid", gap: 8, padding: 12, borderRadius: 12, background: "#F4F4F8" }}>
        <input name="title" placeholder="Topic title" required style={field} />
        <input name="description" placeholder="Description (optional)" style={field} />
        <input name="scheduledAtLocal" type="datetime-local" required style={field} />
        <input name="windowMinutes" type="number" defaultValue={30} min={1} style={field} />
        {err && <p style={{ color: "#D64545" }}>{err}</p>}
        <Button disabled={busy}>{busy ? "Adding…" : "Add topic"}</Button>
      </form>
    </section>
  );
}
