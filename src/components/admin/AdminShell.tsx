export function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main style={{ padding: 20, maxWidth: 720, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>{title}</h1>
        <form action="/api/admin/auth/logout" method="post">
          <button style={{ border: "none", background: "transparent", color: "#888", cursor: "pointer" }}>
            Log out
          </button>
        </form>
      </header>
      {children}
    </main>
  );
}
