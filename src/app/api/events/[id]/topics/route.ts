import { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Topic } from "@/models";
import { requireAdmin, AuthError } from "@/lib/auth-guards";
import { localToUtc } from "@/lib/time";
import { topicToDTO } from "@/lib/dto";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

const TopicInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  scheduledAtLocal: z.string(),
  windowMinutes: z.number().int().positive().default(30),
  order: z.number().int().default(0),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    await dbConnect();
    const { id } = await params;
    const ev = await Event.findById(id);
    if (!ev) return fail("event not found", 404);

    const body = TopicInput.parse(await req.json());
    const scheduledAt = localToUtc(body.scheduledAtLocal, ev.timezone);
    const closeAt = new Date(scheduledAt.getTime() + body.windowMinutes * 60_000);

    const topic = await Topic.create({
      eventId: ev._id,
      title: body.title,
      description: body.description,
      scheduledAt,
      closeAt,
      windowMinutes: body.windowMinutes,
      order: body.order,
      status: "scheduled",
    });
    return ok(topicToDTO(topic), 201);
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, e.status);
    if (e instanceof ZodError) return fail("invalid request", 400);
    console.error("topics POST", e);
    return fail("internal server error", 500);
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    await dbConnect();
    const { id } = await params;
    const topics = await Topic.find({ eventId: id }).sort({ scheduledAt: 1 });
    return ok(topics.map(topicToDTO));
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, e.status);
    console.error("topics GET", e);
    return fail("internal server error", 500);
  }
}
