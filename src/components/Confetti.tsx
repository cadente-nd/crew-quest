"use client";
import { useEffect } from "react";
import confetti from "canvas-confetti";

export function Confetti({ fire }: { fire: boolean }) {
  useEffect(() => {
    if (!fire) return;
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
  }, [fire]);
  return null;
}
