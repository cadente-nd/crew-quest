import { isAdmin } from "@/lib/auth-guards";
import { redirect } from "next/navigation";
import { dbConnect } from "@/lib/db";
import { Event, Topic, Player, Submission } from "@/models";
import { eventToDTO, topicToDTO } from "@/lib/dto";
import { AdminShell } from "@/components/admin/AdminShell";
import { TopicScheduler } from "@/components/admin/TopicScheduler";
import { SubmissionCounts } from "@/components/admin/SubmissionCounts";
import { RevealButton } from "@/components/admin/RevealButton";

export default async function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect("/admin");
  await dbConnect();
  const { id } = await params;
  const ev = await Event.findById(id);
  if (!ev) return <AdminShell title="Not found">Event not found.</AdminShell>;

  const topics = (await Topic.find({ eventId: id }).sort({ scheduledAt: 1 })).map(topicToDTO);
  const players = await Player.countDocuments({ eventId: id });
  const agg = await Submission.aggregate<{ _id: unknown; n: number }>([
    { $match: { eventId: ev._id } },
    { $group: { _id: "$topicId", n: { $sum: 1 } } },
  ]);
  const counts: Record<string, number> = {};
  for (const row of agg) counts[String(row._id)] = row.n;

  const dto = eventToDTO(ev);
  return (
    <AdminShell title={dto.name}>
      <p style={{ color: "#666" }}>
        Join code <strong>{dto.joinCode}</strong> · status {dto.status} · {dto.timezone}
      </p>
      <TopicScheduler eventId={id} topics={topics} />
      <SubmissionCounts topics={topics} counts={counts} players={players} />
      <RevealButton eventId={id} status={dto.status} />
    </AdminShell>
  );
}
