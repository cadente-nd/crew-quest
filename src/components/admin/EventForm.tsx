"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function EventForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const f = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: f.get("name"),
          timezone: f.get("timezone"),
          startAtLocal: f.get("startAtLocal"),
          endAtLocal: f.get("endAtLocal"),
          allowRetake: f.get("allowRetake") === "on",
        }),
      });
      const json = await res.json();
      if (json.ok) router.push(`/admin/events/${json.data.id}`);
      else setErr(json.error);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const field = { padding: 12, borderRadius: 12, border: "1px solid #DDD", fontSize: 16 } as const;
  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12, marginBottom: 24 }}>
      <input name="name" placeholder="Event name" required style={field} />
      <input name="timezone" defaultValue="Asia/Bangkok" style={field} />
      <label htmlFor="startAtLocal" style={{ fontSize: 13, color: "#666" }}>Start</label>
      <input id="startAtLocal" name="startAtLocal" type="datetime-local" required style={field} />
      <label htmlFor="endAtLocal" style={{ fontSize: 13, color: "#666" }}>End</label>
      <input id="endAtLocal" name="endAtLocal" type="datetime-local" required style={field} />
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input name="allowRetake" type="checkbox" defaultChecked /> Allow one retake
      </label>
      {err && <p style={{ color: "#D64545" }}>{err}</p>}
      <Button disabled={busy}>{busy ? "Creating…" : "Create event"}</Button>
    </form>
  );
}
