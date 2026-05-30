import { getAdminSession } from "@/lib/session";
import { adminLineIds } from "@/lib/env";

export class AuthError extends Error {
  status: number;
  constructor(message: string, status = 401) {
    super(message);
    this.status = status;
  }
}

/** Returns the admin's lineUserId or throws AuthError. Use in admin API routes. */
export async function requireAdmin(): Promise<string> {
  const session = await getAdminSession();
  const id = session.adminLineUserId;
  if (!id || !adminLineIds().includes(id)) throw new AuthError("not authorized", 401);
  return id;
}

/** Boolean check for server components (no throw). */
export async function isAdmin(): Promise<boolean> {
  const session = await getAdminSession();
  const id = session.adminLineUserId;
  return !!id && adminLineIds().includes(id);
}
