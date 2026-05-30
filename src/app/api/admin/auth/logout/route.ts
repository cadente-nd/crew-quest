import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/session";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST() {
  const session = await getAdminSession();
  session.destroy();
  return NextResponse.redirect(env().APP_BASE_URL.replace(/\/$/, "") + "/admin", { status: 303 });
}
