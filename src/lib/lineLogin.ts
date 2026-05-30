import { jwtVerify, createRemoteJWKSet } from "jose";
import { env } from "@/lib/env";

const REDIRECT_PATH = "/api/admin/auth/callback";
const JWKS = createRemoteJWKSet(new URL("https://api.line.me/oauth2/v2.1/certs"));

export function redirectUri() {
  return env().APP_BASE_URL.replace(/\/$/, "") + REDIRECT_PATH;
}

export function buildAuthorizeUrl(state: string) {
  const p = new URLSearchParams({
    response_type: "code",
    client_id: env().LINE_LOGIN_CHANNEL_ID,
    redirect_uri: redirectUri(),
    state,
    scope: "openid profile",
  });
  return "https://access.line.me/oauth2/v2.1/authorize?" + p.toString();
}

interface TokenResponse {
  id_token: string;
  access_token: string;
}

export async function exchangeCode(code: string): Promise<TokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri(),
    client_id: env().LINE_LOGIN_CHANNEL_ID,
    client_secret: env().LINE_LOGIN_CHANNEL_SECRET,
  });
  const res = await fetch("https://api.line.me/oauth2/v2.1/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error("token exchange failed: " + (await res.text()));
  return (await res.json()) as TokenResponse;
}

/** Verify the LINE id_token signature and claims; returns the LINE userId (sub) and name. */
export async function verifyIdToken(idToken: string): Promise<{ sub: string; name: string }> {
  const { payload } = await jwtVerify(idToken, JWKS, {
    issuer: "https://access.line.me",
    audience: env().LINE_LOGIN_CHANNEL_ID,
  });
  return { sub: String(payload.sub), name: String(payload.name ?? "") };
}
