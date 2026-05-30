"use client";
import liff from "@line/liff";
import { PUBLIC_LIFF_ID } from "@/lib/env";

export interface LiffProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
  idToken: string;
  isBotFriend: boolean;
}

let initialized = false;

export async function initLiff(): Promise<void> {
  if (initialized) return;
  await liff.init({ liffId: PUBLIC_LIFF_ID });
  initialized = true;
}

const RELOGIN_FLAG = "cq-relogin-attempted";

/**
 * Re-login to mint a fresh id_token after the server rejected an expired one
 * (HTTP 401), then return to the current page. liff.getIDToken() returns the
 * token cached at login, which expires while isLoggedIn() (access token) stays
 * true — so the only way to refresh it is to log in again. liff.login()
 * navigates away, so this never resolves on the happy path.
 *
 * Guarded against an infinite redirect loop: if we already re-logged in once
 * this navigation and STILL got 401, throw instead of redirecting again (that
 * points to a channel-id misconfig, not an expired token).
 */
export async function reloginForFreshToken(): Promise<never> {
  if (sessionStorage.getItem(RELOGIN_FLAG)) {
    sessionStorage.removeItem(RELOGIN_FLAG);
    throw new Error("Your LINE session expired. Please reopen the app from the LINE chat.");
  }
  sessionStorage.setItem(RELOGIN_FLAG, "1");
  await initLiff();
  liff.login({ redirectUri: window.location.href });
  return new Promise<never>(() => {});
}

/** Clear the relogin guard once a request succeeded with the current token. */
export function clearReloginGuard(): void {
  sessionStorage.removeItem(RELOGIN_FLAG);
}

export async function ensureLogin(): Promise<LiffProfile> {
  await initLiff();
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    // login() navigates away; return a never-resolving promise to halt.
    return new Promise<LiffProfile>(() => {});
  }
  const profile = await liff.getProfile();
  const idToken = liff.getIDToken();
  if (!idToken) throw new Error("LINE id token unavailable — please reload the app");
  let isBotFriend = false;
  try {
    isBotFriend = (await liff.getFriendship()).friendFlag;
  } catch {
    isBotFriend = false;
  }
  return {
    userId: profile.userId,
    displayName: profile.displayName,
    pictureUrl: profile.pictureUrl,
    idToken,
    isBotFriend,
  };
}
