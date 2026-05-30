import { dbConnect } from "@/lib/db";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    await dbConnect();
    return ok({ status: "healthy", db: "connected" });
  } catch (e) {
    console.error("health GET", e);
    return fail("internal error", 500);
  }
}
