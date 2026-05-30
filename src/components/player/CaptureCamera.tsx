"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

interface Props {
  onCapture: (blob: Blob) => void;
}

/** Live camera via getUserMedia, with a file-input fallback for restricted in-app browsers. */
export function CaptureCamera({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!active) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play(); }
      } catch {
        setUnsupported(true);
      }
    })();
    return () => { active = false; streamRef.current?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function snap() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob((b) => { if (b) onCapture(b); }, "image/jpeg", 0.85);
  }

  if (unsupported) {
    return (
      <div style={{ padding: 24, display: "grid", gap: 12 }}>
        <p>Camera unavailable here — use your camera to take a fresh photo:</p>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onCapture(f); }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <video ref={videoRef} playsInline muted style={{ width: "100%", borderRadius: 16, background: "#000" }} />
      <Button onClick={snap}>📸 Capture</Button>
    </div>
  );
}
