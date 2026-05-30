import { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Player } from "@/models";
import { verifyLiffIdToken } from "@/lib/liffVerify";
import { eventToDTO } from "@/lib/dto";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

const JoinSchema = z.object({
  idToken: z.string().min(1),
  displayName: z.string().default(""),
  pictureUrl: z.string().optional(),
  isBotFriend: z.boolean().default(false),
});

// `id` here may be an event _id OR a join code.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();
    const { id } = await params;
    const body = JoinSchema.parse(await req.json());
    const verified = await verifyLiffIdToken(body.idToken);

    const ev =
      (await Event.findOne({ joinCode: id.toUpperCase() })) ||
      (id.match(/^[a-f0-9]{24}$/i) ? await Event.findById(id) : null);
    if (!ev) return fail("event not found", 404);

    if (ev.status === "ended" || ev.status === "revealed") {
      return fail("this event has ended", 403);
    }

    const player = await Player.findOneAndUpdate(
      { eventId: ev._id, lineUserId: verified.sub },
      {
        $set: {
          displayName: body.displayName || verified.name,
          pictureUrl: body.pictureUrl ?? verified.picture ?? "",
          isBotFriend: body.isBotFriend,
        },
        $setOnInsert: { joinedAt: new Date() },
      },
      { upsert: true, new: true }
    );

    return ok({ event: eventToDTO(ev), playerId: String(player._id) });
  } catch (e) {
    if (e instanceof ZodError) return fail("invalid request", 400);
    console.error("join POST", e);
    return fail("internal server error", 500);
  }
}
