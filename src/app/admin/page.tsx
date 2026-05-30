import { isAdmin } from "@/lib/auth-guards";
import { redirect } from "next/navigation";

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isAdmin()) redirect("/admin/events");
  const { error } = await searchParams;
  return (
    <main style={{ padding: 24, display: "grid", gap: 20, alignContent: "center", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800 }}>Crew Quest Admin</h1>
      {error === "forbidden" && <p style={{ color: "#D64545" }}>That LINE account is not on the allowlist.</p>}
      {error && error !== "forbidden" && <p style={{ color: "#D64545" }}>Login failed. Try again.</p>}
      <a href="/api/admin/auth/login">
        <button
          style={{
            width: "100%", padding: 16, fontSize: 18, fontWeight: 700,
            borderRadius: "1.25rem", border: "none", color: "#fff",
            background: "#06C755", cursor: "pointer",
          }}
        >
          Log in with LINE
        </button>
      </a>
    </main>
  );
}
