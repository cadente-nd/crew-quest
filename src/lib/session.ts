import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import { env } from "@/lib/env";

export interface AdminSession {
  adminLineUserId?: string;
  displayName?: string;
}

function options(): SessionOptions {
  return {
    password: env().ADMIN_SESSION_SECRET,
    cookieName: "crewquest_admin",
    cookieOptions: { secure: process.env.NODE_ENV === "production", httpOnly: true, sameSite: "lax" },
  };
}

export async function getAdminSession() {
  const store = await cookies();
  return getIronSession<AdminSession>(store, options());
}
