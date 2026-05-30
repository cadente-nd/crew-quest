"use client";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ensureLogin, reloginForFreshToken, clearReloginGuard } from "@/lib/liff";
import { CaptureCamera } from "@/components/player/CaptureCamera";
import { Confetti } from "@/components/Confetti";
import { Button } from "@/components/ui/Button";

export default function CapturePage() {
  const { id, topicId } = useParams<{ id: string; topicId: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    return () => { if (preview) URL.revokeObjectURL(preview.url); };
  }, [preview]);

  function onCapture(blob: Blob) {
    setPreview((prev) => {
      if (prev) URL.revokeObjectURL(prev.url);
      return { blob, url: URL.createObjectURL(blob) };
    });
  }

  async function submit() {
    if (!preview) return;
    setBusy(true);
    setErr("");
    try {
      const p = await ensureLogin();
      const fd = new FormData();
      fd.set("idToken", p.idToken);
      fd.set("eventId", id);
      fd.set("topicId", topicId);
      fd.set("photo", preview.blob, "capture.jpg");
      const res = await fetch("/api/submissions", { method: "POST", body: fd });
      if (res.status === 401) {
        await reloginForFreshToken();
        return;
      }
      const json = await res.json();
      if (json.ok) {
        clearReloginGuard();
        setDone(true);
        setTimeout(() => router.replace(`/event/${id}`), 1800);
      } else setErr(json.error);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 20, display: "grid", gap: 16 }}>
      <Confetti fire={done} />
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Capture the moment</h1>
      {done ? (
        <p style={{ fontSize: 20 }}>🎉 Submitted! Redirecting…</p>
      ) : preview ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview.url} alt="preview" style={{ width: "100%", borderRadius: 16 }} />
          {err && <p style={{ color: "#D64545" }}>{err}</p>}
          <Button onClick={submit} disabled={busy}>{busy ? "Uploading…" : "Use this photo"}</Button>
          <Button variant="ghost" onClick={() => { if (preview) URL.revokeObjectURL(preview.url); setPreview(null); }} disabled={busy}>Retake</Button>
        </>
      ) : (
        <CaptureCamera onCapture={onCapture} />
      )}
    </main>
  );
}
