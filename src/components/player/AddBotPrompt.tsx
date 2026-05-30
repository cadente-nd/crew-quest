import { theme } from "@/theme/tokens";

export function AddBotPrompt({ botBasicId }: { botBasicId: string }) {
  const href = botBasicId ? `https://line.me/R/ti/p/${encodeURIComponent(botBasicId)}` : "#";
  return (
    <div style={{ padding: 16, borderRadius: theme.radius, background: "#FFF6E5", margin: "12px 0" }}>
      <p style={{ margin: 0, fontWeight: 700 }}>📣 Add our LINE bot to get photo alerts</p>
      <p style={{ margin: "6px 0 12px", fontSize: 14, color: "#876" }}>
        You won&apos;t receive topic notifications until you add us as a friend.
      </p>
      <a
        href={href}
        target="_blank"
        rel="noreferrer"
        role="button"
        style={{ display: "inline-block", padding: "10px 16px", borderRadius: 12, background: "#06C755", color: "#fff", fontWeight: 700, textDecoration: "none" }}
      >
        Add friend
      </a>
    </div>
  );
}
