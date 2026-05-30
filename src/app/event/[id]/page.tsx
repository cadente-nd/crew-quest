"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ensureLogin } from "@/lib/liff";
import { Spinner } from "@/components/ui/Spinner";
import { TopicCard } from "@/components/player/TopicCard";
import { ProgressHeader } from "@/components/player/ProgressHeader";
import { AddBotPrompt } from "@/components/player/AddBotPrompt";
import type { ActiveTopicDTO } from "@/types";

export default function EventHome() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ActiveTopicDTO | null>(null);
  const [notFriend, setNotFriend] = useState(false);
  const [botId, setBotId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    (async () => {
      try {
        const p = await ensureLogin();
        if (cancelled) return;
        setNotFriend(!p.isBotFriend);
        setBotId(process.env.NEXT_PUBLIC_LINE_BOT_BASIC_ID ?? "");
        const load = async () => {
          const res = await fetch(`/api/events/${id}/active-topic`, { headers: { "x-line-id-token": p.idToken } });
          const json = await res.json();
          if (json.ok) setData(json.data);
          else setError(json.error);
        };
        await load();
        if (cancelled) return;
        timer = setInterval(load, 15000);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [id]);

  if (error) return <p style={{ padding: 24, color: "#D64545" }}>{error}</p>;
  if (!data) return <Spinner />;

  return (
    <main style={{ padding: 20 }}>
      <ProgressHeader completed={data.completed} total={data.total} />
      {notFriend && <AddBotPrompt botBasicId={botId} />}
      {data.topic ? (
        <TopicCard topic={data.topic} eventId={id} alreadySubmitted={data.alreadySubmitted} />
      ) : (
        <div style={{ padding: 32, textAlign: "center", color: "#888" }}>
          <p style={{ fontSize: 22 }}>No active topic right now ✨</p>
          <p>Keep your notifications on — the next one drops soon!</p>
        </div>
      )}
      {data.eventStatus === "revealed" && (
        <a href={`/event/${id}/reveal`} style={{ display: "block", marginTop: 16 }}>
          <button style={{ width: "100%", padding: 16, borderRadius: 20, border: "none", background: "#A06CD5", color: "#fff", fontWeight: 800, fontSize: 18 }}>
            🎬 Watch the reveal
          </button>
        </a>
      )}
    </main>
  );
}
