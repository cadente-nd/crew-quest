import { env } from "@/lib/env";

export interface VerifiedLineUser {
  sub: string;
  name: string;
  picture?: string;
}

/**
 * Verify a LIFF/LINE id_token server-side via LINE's verify endpoint.
 * The client_id must be the LIFF's linked LINE Login channel id.
 */
export async function verifyLiffIdToken(idToken: string): Promise<VerifiedLineUser> {
  const body = new URLSearchParams({ id_token: idToken, client_id: env().LINE_LOGIN_CHANNEL_ID });
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("id_token verification failed");
  const data = (await res.json()) as { sub: string; name?: string; picture?: string };
  return { sub: data.sub, name: data.name ?? "", picture: data.picture };
}
