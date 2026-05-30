import { NextRequest } from "next/server";
import { dbConnect } from "@/lib/db";
import { Event } from "@/models";
import { requireAdmin, AuthError } from "@/lib/auth-guards";
import { eventToDTO } from "@/lib/dto";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    await dbConnect();
    const { id } = await params;
    const ev = await Event.findByIdAndUpdate(id, { $set: { status: "revealed" } }, { new: true });
    if (!ev) return fail("event not found", 404);
    return ok(eventToDTO(ev));
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, e.status);
    console.error("reveal POST", e);
    return fail("internal server error", 500);
  }
}
