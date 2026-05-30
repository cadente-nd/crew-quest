"use client";
import { useEffect, useState } from "react";

/** Counts down to `deadline` (ISO). Pure display; server owns the real cutoff. */
export function CountdownRing({ deadline }: { deadline: string }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(deadline).getTime() - Date.now()));
  useEffect(() => {
    const t = setInterval(() => {
      setRemaining(Math.max(0, new Date(deadline).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, [deadline]);
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000).toString().padStart(2, "0");
  return (
    <div style={{ fontSize: 40, fontWeight: 800, color: remaining < 60000 ? "#D64545" : "#1A1A2E" }}>
      {mm}:{ss}
    </div>
  );
}
