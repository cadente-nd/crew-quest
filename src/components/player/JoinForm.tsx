"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ensureLogin } from "@/lib/liff";
import { Button } from "@/components/ui/Button";

export function JoinForm({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function join() {
    setBusy(true);
    setErr("");
    try {
      const p = await ensureLogin();
      const res = await fetch(`/api/events/${encodeURIComponent(code.trim())}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: p.idToken,
          displayName: p.displayName,
          pictureUrl: p.pictureUrl,
          isBotFriend: p.isBotFriend,
        }),
      });
      const json = await res.json();
      if (json.ok) router.replace(`/event/${json.data.event.id}`);
      else setErr(json.error);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14, padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Join the game</h1>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Enter join code"
        style={{ padding: 16, fontSize: 22, letterSpacing: 4, textAlign: "center", borderRadius: 16, border: "2px solid #EEE" }}
      />
      {err && <p style={{ color: "#D64545" }}>{err}</p>}
      <Button disabled={busy || !code} onClick={join}>{busy ? "Joining…" : "Join"}</Button>
    </div>
  );
}
