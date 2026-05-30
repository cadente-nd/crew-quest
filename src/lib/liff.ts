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
