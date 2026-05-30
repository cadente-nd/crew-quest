"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { EventStatus } from "@/types";

export function RevealButton({ eventId, status }: { eventId: string; status: EventStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (status === "revealed") {
    return <p style={{ marginTop: 24, fontWeight: 700, color: "#6BCB77" }}>🎬 Reveal is live.</p>;
  }

  async function trigger() {
    if (!confirm("Reveal all photos to players now? This cannot be undone.")) return;
    setBusy(true);
    setErr("");
    try {
      const res = await fetch(`/api/events/${eventId}/reveal`, { method: "POST" });
      const json = await res.json();
      if (json.ok) router.refresh();
      else setErr(json.error || "Failed to trigger reveal");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 24 }}>
      <Button onClick={trigger} disabled={busy}>{busy ? "Revealing…" : "🎉 Trigger reveal"}</Button>
      {err && <p style={{ color: "#D64545", marginTop: 8 }}>{err}</p>}
    </div>
  );
}
