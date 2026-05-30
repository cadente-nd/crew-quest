"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { RevealSubmissionDTO } from "@/types";

export function Slideshow({ items }: { items: RevealSubmissionDTO[] }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || items.length === 0) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), 3500); // music-video pacing
    return () => clearInterval(t);
  }, [playing, items.length]);

  if (items.length === 0) return <p style={{ color: "#fff", padding: 24 }}>No photos to show.</p>;
  const cur = items[i];

  return (
    <div
      onClick={() => setPlaying((p) => !p)}
      style={{ position: "fixed", inset: 0, background: "#0B0B14", display: "grid", placeItems: "center" }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.6 }}
          style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", padding: 16 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cur.imageUrl} alt={cur.topicTitle} style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 16 }} />
          <div style={{ position: "absolute", bottom: 40, left: 0, right: 0, textAlign: "center", color: "#fff" }}>
            <p style={{ fontSize: 14, opacity: 0.8, margin: 0 }}>{cur.topicTitle}</p>
            <p style={{ fontSize: 22, fontWeight: 800, margin: "4px 0" }}>{cur.displayName}</p>
          </div>
        </motion.div>
      </AnimatePresence>
      <div style={{ position: "absolute", top: 16, right: 16, color: "#fff", fontSize: 13, opacity: 0.7 }}>
        {i + 1}/{items.length} · tap to {playing ? "pause" : "play"}
      </div>
    </div>
  );
}
