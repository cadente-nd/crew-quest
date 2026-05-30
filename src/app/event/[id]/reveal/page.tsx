"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Slideshow } from "@/components/reveal/Slideshow";
import { Spinner } from "@/components/ui/Spinner";
import type { RevealSubmissionDTO } from "@/types";

export default function RevealPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<RevealSubmissionDTO[] | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/events/${id}/reveal-data`);
      if (res.status === 403) { setLocked(true); return; }
      const json = await res.json();
      if (json.ok) setItems(json.data.items);
    })();
  }, [id]);

  if (locked) {
    return (
      <main style={{ padding: 32, textAlign: "center" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>The reveal hasn&apos;t started yet 🎬</h1>
        <p style={{ color: "#888" }}>Hang tight — your host will start it soon!</p>
      </main>
    );
  }
  if (!items) return <Spinner />;
  return <Slideshow items={items} />;
}
