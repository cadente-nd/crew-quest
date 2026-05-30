import { isAdmin } from "@/lib/auth-guards";
import { redirect } from "next/navigation";
import { dbConnect } from "@/lib/db";
import { Event } from "@/models";
import { eventToDTO } from "@/lib/dto";
import { AdminShell } from "@/components/admin/AdminShell";
import { EventForm } from "@/components/admin/EventForm";
import Link from "next/link";

export default async function EventsPage() {
  if (!(await isAdmin())) redirect("/admin");
  await dbConnect();
  const events = (await Event.find().sort({ createdAt: -1 })).map(eventToDTO);
  return (
    <AdminShell title="Events">
      <EventForm />
      <div style={{ display: "grid", gap: 10 }}>
        {events.map((e) => (
          <Link key={e.id} href={`/admin/events/${e.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ padding: 16, borderRadius: 16, background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
              <strong>{e.name}</strong> · code {e.joinCode} · {e.status}
            </div>
          </Link>
        ))}
        {events.length === 0 && <p style={{ color: "#888" }}>No events yet. Create one above.</p>}
      </div>
    </AdminShell>
  );
}
