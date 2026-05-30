import { NextRequest } from "next/server";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event } from "@/models";
import { requireAdmin, AuthError } from "@/lib/auth-guards";
import { generateJoinCode } from "@/lib/joinCode";
import { localToUtc } from "@/lib/time";
import { eventToDTO } from "@/lib/dto";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

const CreateSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().default("Asia/Bangkok"),
  startAtLocal: z.string(), // "YYYY-MM-DDTHH:mm" in timezone
  endAtLocal: z.string(),
  allowRetake: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const adminId = await requireAdmin();
    await dbConnect();
    const body = CreateSchema.parse(await req.json());

    // Retry join-code generation on the rare unique collision.
    let joinCode = generateJoinCode();
    for (let i = 0; i < 5; i++) {
      if (!(await Event.exists({ joinCode }))) break;
      joinCode = generateJoinCode();
    }

    const ev = await Event.create({
      name: body.name,
      timezone: body.timezone,
      joinCode,
      startAt: localToUtc(body.startAtLocal, body.timezone),
      endAt: localToUtc(body.endAtLocal, body.timezone),
      status: "draft",
      adminIds: [adminId],
      settings: { allowRetake: body.allowRetake },
    });
    return ok(eventToDTO(ev), 201);
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, e.status);
    return fail((e as Error).message, 400);
  }
}

export async function GET() {
  try {
    await requireAdmin();
    await dbConnect();
    const events = await Event.find().sort({ createdAt: -1 });
    return ok(events.map(eventToDTO));
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, e.status);
    return fail((e as Error).message, 400);
  }
}
