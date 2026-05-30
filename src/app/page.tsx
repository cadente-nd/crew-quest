"use client";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ensureLogin } from "@/lib/liff";
import { Spinner } from "@/components/ui/Spinner";

function Entry() {
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        await ensureLogin();
        const eventParam = search.get("event");
        // Deep-link with ?event=<code|id> goes straight to join.
        router.replace(eventParam ? `/join?event=${encodeURIComponent(eventParam)}` : "/join");
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [router, search]);

  if (error) return <p style={{ padding: 24, color: "#D64545" }}>Could not start: {error}</p>;
  return <Spinner />;
}

export default function Home() {
  return (
    <Suspense fallback={<Spinner />}>
      <Entry />
    </Suspense>
  );
}
