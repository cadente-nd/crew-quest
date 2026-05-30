"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ensureLogin, reloginForFreshToken, clearReloginGuard } from "@/lib/liff";
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
          if (res.status === 401) {
            // id_token expired mid-session — refresh it and reload.
            await reloginForFreshToken();
            return;
          }
          const json = await res.json();
          if (json.ok) {
            clearReloginGuard();
            setData(json.data);
          } else setError(json.error);
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
        <a
          href={`/event/${id}/reveal`}
          style={{ display: "block", marginTop: 16, textAlign: "center", padding: 16, borderRadius: 20, background: "#A06CD5", color: "#fff", fontWeight: 800, fontSize: 18, textDecoration: "none", boxSizing: "border-box" }}
        >
          🎬 Watch the reveal
        </a>
      )}
    </main>
  );
}
