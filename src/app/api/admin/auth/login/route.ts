import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { buildAuthorizeUrl } from "@/lib/lineLogin";

export const runtime = "nodejs";

export async function GET() {
  // Random state stored in a short-lived cookie to prevent CSRF.
  const state = crypto.randomUUID();
  const store = await cookies();
  store.set("crewquest_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    maxAge: 600,
    secure: process.env.NODE_ENV === "production",
  });
  return NextResponse.redirect(buildAuthorizeUrl(state));
}
