import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { exchangeCode, verifyIdToken } from "@/lib/lineLogin";
import { getAdminSession } from "@/lib/session";
import { adminLineIds, env } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const store = await cookies();
  const expected = store.get("crewquest_oauth_state")?.value;

  if (!code || !state || state !== expected) {
    return NextResponse.redirect(env().APP_BASE_URL.replace(/\/$/, "") + "/admin?error=state");
  }
  store.delete("crewquest_oauth_state");
  try {
    const { id_token } = await exchangeCode(code);
    const { sub, name } = await verifyIdToken(id_token);
    if (!adminLineIds().includes(sub)) {
      return NextResponse.redirect(env().APP_BASE_URL.replace(/\/$/, "") + "/admin?error=forbidden");
    }
    const session = await getAdminSession();
    session.adminLineUserId = sub;
    session.displayName = name;
    await session.save();
    return NextResponse.redirect(env().APP_BASE_URL.replace(/\/$/, "") + "/admin/events");
  } catch (e) {
    console.error("admin oauth callback", e);
    return NextResponse.redirect(env().APP_BASE_URL.replace(/\/$/, "") + "/admin?error=auth");
  }
}
