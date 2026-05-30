import { env } from "@/lib/env";
import { AuthError } from "@/lib/auth-guards";

export interface VerifiedLineUser {
  sub: string;
  name: string;
  picture?: string;
}

/**
 * Verify a LIFF/LINE id_token server-side via LINE's verify endpoint.
 * The client_id must be the LIFF's linked LINE Login channel id.
 *
 * Throws AuthError(401) on a rejected token — this is a client-auth
 * condition (commonly an expired LIFF id_token), not a server fault, so
 * callers should surface it as 401 rather than 500.
 */
export async function verifyLiffIdToken(idToken: string): Promise<VerifiedLineUser> {
  const body = new URLSearchParams({ id_token: idToken, client_id: env().LINE_LOGIN_CHANNEL_ID });
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    // LINE returns { error, error_description } (e.g. "id token expired" vs
    // "client_id does not match audience"). Surface it so the actual cause
    // is visible in logs/responses instead of being swallowed.
    const detail = (await res.json().catch(() => null)) as
      | { error?: string; error_description?: string }
      | null;
    const reason = detail?.error_description || detail?.error || `HTTP ${res.status}`;
    throw new AuthError(`id_token verification failed: ${reason}`, 401);
  }
  const data = (await res.json()) as { sub: string; name?: string; picture?: string };
  return { sub: data.sub, name: data.name ?? "", picture: data.picture };
}
