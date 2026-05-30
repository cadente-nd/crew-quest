# Crew Quest v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a LINE LIFF team-outing photo game where an admin schedules photo topics, players get LINE push notifications and live-capture photos within a timed window, and all photos stay hidden until an end-of-event reveal slideshow.

**Architecture:** Next.js App Router (TypeScript) full-stack app. MongoDB/Mongoose for data, DigitalOcean Spaces (S3) for images, LINE LIFF for player auth, LINE Messaging API for push, LINE Login OAuth + allowlist for admin. All time/eligibility logic is server-authoritative against UTC values. Vercel Cron drives an idempotent scheduler.

**Tech Stack:** next, react, typescript, tailwindcss, mongoose, @line/liff, @line/bot-sdk, @aws-sdk/client-s3, sharp, iron-session, jose, zod, luxon, framer-motion, canvas-confetti.

**Testing note:** Per product decision, v1 uses **manual verification + a health check endpoint** — no automated test suite. Each task ends with a concrete manual/curl verification step and a commit, in place of the usual TDD cycle.

**Conventions:**
- All API routes that touch Mongo/sharp run on the Node runtime: add `export const runtime = 'nodejs'`.
- Every API route calls `await dbConnect()` before DB access.
- Commit after each task with the message shown.

---

## File Structure

```
package.json, tsconfig.json, next.config.ts, .env.example, .gitignore, vercel.json
tailwind.config.ts, postcss.config.mjs
src/
  app/
    layout.tsx, page.tsx, globals.css, not-found.tsx
    join/page.tsx
    event/[id]/page.tsx
    event/[id]/capture/[topicId]/page.tsx
    event/[id]/reveal/page.tsx
    admin/page.tsx
    admin/events/page.tsx
    admin/events/[id]/page.tsx
    api/
      health/route.ts
      events/route.ts
      events/[id]/topics/route.ts
      events/[id]/join/route.ts
      events/[id]/active-topic/route.ts
      events/[id]/reveal/route.ts
      events/[id]/reveal-data/route.ts
      submissions/route.ts
      cron/tick/route.ts
      admin/auth/login/route.ts
      admin/auth/callback/route.ts
      admin/auth/logout/route.ts
  lib/  env.ts, db.ts, time.ts, dto.ts, session.ts, auth-guards.ts,
        lineLogin.ts, liff.ts, liffVerify.ts, line.ts, storage.ts, images.ts,
        joinCode.ts, http.ts
  models/  Event.ts, Topic.ts, Player.ts, Submission.ts, PushLog.ts, index.ts
  components/
    ui/ (Button.tsx, Card.tsx, CountdownRing.tsx, ProgressBar.tsx, Spinner.tsx)
    player/ (TopicCard.tsx, CaptureCamera.tsx, JoinForm.tsx, AddBotPrompt.tsx, ProgressHeader.tsx)
    reveal/ (Slideshow.tsx)
    admin/ (EventForm.tsx, TopicScheduler.tsx, SubmissionCounts.tsx, AdminShell.tsx)
    Confetti.tsx
  theme/ tokens.ts
  types/ index.ts
```

---

## Phase 0 — Scaffold & Infra

### Task 0.1: Initialize Next.js project

**Files:** Create: `package.json`, `tsconfig.json`, `next.config.ts`, `tailwind.config.ts`, `postcss.config.mjs`, `src/app/globals.css`, `.gitignore`

- [ ] **Step 1: Scaffold with create-next-app**

Run from `/root/crew-quest` (the dir already contains README.md and docs/, so scaffold in place):
```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --eslint --use-npm --no-import-alias --no-turbopack
```
When prompted to proceed in a non-empty directory, accept. Accept defaults otherwise.

- [ ] **Step 2: Configure the `@/` import alias**

Edit `tsconfig.json` `compilerOptions` to include:
```json
"baseUrl": ".",
"paths": { "@/*": ["./src/*"] }
```

- [ ] **Step 3: Install runtime dependencies**

```bash
npm install mongoose @line/liff @line/bot-sdk @aws-sdk/client-s3 sharp iron-session jose zod luxon framer-motion canvas-confetti
npm install --save-dev @types/canvas-confetti @types/luxon
```

- [ ] **Step 4: Verify build tooling**

Run: `npm run lint`
Expected: completes without crashing (warnings ok).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js app with dependencies"
```

---

### Task 0.2: Environment variable validation

**Files:** Create: `src/lib/env.ts`, `.env.example`

- [ ] **Step 1: Create `.env.example`**

```
# Core
MONGODB_URI=
APP_BASE_URL=http://localhost:3000

# LIFF (player) — exposed to browser
NEXT_PUBLIC_LIFF_ID=

# LINE Login (admin OAuth)
LINE_LOGIN_CHANNEL_ID=
LINE_LOGIN_CHANNEL_SECRET=
ADMIN_LINE_IDS=
ADMIN_SESSION_SECRET=

# LINE Messaging API (push)
LINE_MESSAGING_CHANNEL_ACCESS_TOKEN=
LINE_MESSAGING_CHANNEL_SECRET=
LINE_BOT_BASIC_ID=

# DigitalOcean Spaces (S3-compatible)
SPACES_ENDPOINT=
SPACES_REGION=
SPACES_BUCKET=
SPACES_KEY=
SPACES_SECRET=
SPACES_CDN_BASE_URL=

# Cron
CRON_SECRET=
```

- [ ] **Step 2: Create `src/lib/env.ts`**

```ts
import { z } from "zod";

const serverSchema = z.object({
  MONGODB_URI: z.string().min(1),
  APP_BASE_URL: z.string().url(),
  LINE_LOGIN_CHANNEL_ID: z.string().min(1),
  LINE_LOGIN_CHANNEL_SECRET: z.string().min(1),
  ADMIN_LINE_IDS: z.string().default(""),
  ADMIN_SESSION_SECRET: z.string().min(32),
  LINE_MESSAGING_CHANNEL_ACCESS_TOKEN: z.string().min(1),
  LINE_MESSAGING_CHANNEL_SECRET: z.string().min(1),
  LINE_BOT_BASIC_ID: z.string().optional().default(""),
  SPACES_ENDPOINT: z.string().url(),
  SPACES_REGION: z.string().min(1),
  SPACES_BUCKET: z.string().min(1),
  SPACES_KEY: z.string().min(1),
  SPACES_SECRET: z.string().min(1),
  SPACES_CDN_BASE_URL: z.string().optional().default(""),
  CRON_SECRET: z.string().min(1),
});

let cached: z.infer<typeof serverSchema> | null = null;

/** Server-only env. Throws on first access if misconfigured. Never import from client components. */
export function env() {
  if (cached) return cached;
  const parsed = serverSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      "Invalid environment variables: " +
        JSON.stringify(parsed.error.flatten().fieldErrors)
    );
  }
  cached = parsed.data;
  return cached;
}

export function adminLineIds(): string[] {
  return env()
    .ADMIN_LINE_IDS.split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Browser-safe: LIFF id is a NEXT_PUBLIC_ var. */
export const PUBLIC_LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID ?? "";
```

- [ ] **Step 3: Create a local `.env.local` for development**

Copy `.env.example` to `.env.local` and fill any values you have. For now set at least `MONGODB_URI`, `ADMIN_SESSION_SECRET` (any 32+ char string), and `CRON_SECRET`. (This file is gitignored.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/env.ts .env.example
git commit -m "feat: add validated env loader"
```

---

### Task 0.3: MongoDB connection helper

**Files:** Create: `src/lib/db.ts`

- [ ] **Step 1: Create `src/lib/db.ts`**

```ts
import mongoose from "mongoose";
import { env } from "@/lib/env";

// Cache across hot-reloads and serverless invocations to avoid connection storms.
type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };
const globalForMongoose = globalThis as unknown as { _mongoose?: Cache };
const cache: Cache = globalForMongoose._mongoose ?? { conn: null, promise: null };
globalForMongoose._mongoose = cache;

export async function dbConnect(): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  if (!cache.promise) {
    cache.promise = mongoose.connect(env().MONGODB_URI, { bufferCommands: false });
  }
  cache.conn = await cache.promise;
  return cache.conn;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/db.ts
git commit -m "feat: add cached mongoose connection"
```

---

### Task 0.4: HTTP helpers, theme tokens, root layout

**Files:** Create: `src/lib/http.ts`, `src/theme/tokens.ts`; Modify: `src/app/layout.tsx`, `src/app/globals.css`

- [ ] **Step 1: Create `src/lib/http.ts`**

```ts
import { NextResponse } from "next/server";

export function ok<T>(data: T, init?: number) {
  return NextResponse.json({ ok: true, data }, { status: init ?? 200 });
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}
```

- [ ] **Step 2: Create `src/theme/tokens.ts`**

```ts
// Setlog-inspired bright multi-accent palette. Used by Tailwind config + inline gradients.
export const theme = {
  gradients: {
    hero: "linear-gradient(135deg,#FF6B9D 0%,#FFC371 50%,#5BC0EB 100%)",
    party: "linear-gradient(135deg,#A06CD5 0%,#FF6B9D 50%,#FFD93D 100%)",
  },
  accents: ["#FF6B9D", "#FFC371", "#5BC0EB", "#A06CD5", "#FFD93D", "#6BCB77"],
  radius: "1.25rem",
};
```

- [ ] **Step 3: Replace `src/app/globals.css` body section** with a mobile-first base. Append after the existing `@tailwind` directives:

```css
:root { --max-w: 480px; }
html, body { height: 100%; }
body {
  margin: 0;
  -webkit-tap-highlight-color: transparent;
  background: #FAFAFC;
  color: #1A1A2E;
  font-family: ui-rounded, system-ui, -apple-system, "Segoe UI", sans-serif;
}
.app-shell { max-width: var(--max-w); margin: 0 auto; min-height: 100%; }
```

- [ ] **Step 4: Replace `src/app/layout.tsx`**

```tsx
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Crew Quest",
  description: "Team outing photo game",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#FF6B9D",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/http.ts src/theme/tokens.ts src/app/layout.tsx src/app/globals.css
git commit -m "feat: add http helpers, theme tokens, mobile-first layout"
```

---

### Task 0.5: Health check route

**Files:** Create: `src/app/api/health/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { dbConnect } from "@/lib/db";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    await dbConnect();
    return ok({ status: "healthy", db: "connected" });
  } catch (e) {
    return fail("db connection failed: " + (e as Error).message, 500);
  }
}
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, then in another shell: `curl -s localhost:3000/api/health`
Expected: `{"ok":true,"data":{"status":"healthy","db":"connected"}}` (requires a reachable `MONGODB_URI`).

- [ ] **Step 3: Commit**

```bash
git add src/app/api/health/route.ts
git commit -m "feat: add health check endpoint"
```

---

## Phase 1 — Models & DTOs

### Task 1.1: Shared types & enums

**Files:** Create: `src/types/index.ts`

- [ ] **Step 1: Create `src/types/index.ts`**

```ts
export type EventStatus = "draft" | "live" | "ended" | "revealed";
export type TopicStatus = "scheduled" | "open" | "closed";

export interface EventDTO {
  id: string;
  name: string;
  joinCode: string;
  timezone: string;
  startAt: string; // ISO
  endAt: string; // ISO
  status: EventStatus;
  settings: { allowRetake: boolean };
}

export interface TopicDTO {
  id: string;
  eventId: string;
  title: string;
  description?: string;
  scheduledAt: string; // ISO UTC
  closeAt: string; // ISO UTC
  windowMinutes: number;
  status: TopicStatus;
  order: number;
}

export interface ActiveTopicDTO {
  topic: TopicDTO | null;
  serverNow: string; // ISO — client computes countdown against closeAt
  alreadySubmitted: boolean;
  completed: number;
  total: number;
}

export interface RevealSubmissionDTO {
  topicId: string;
  topicTitle: string;
  imageUrl: string;
  thumbnailUrl: string;
  displayName: string;
  pictureUrl?: string;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add shared types and DTO interfaces"
```

---

### Task 1.2: Mongoose models

**Files:** Create: `src/models/Event.ts`, `src/models/Topic.ts`, `src/models/Player.ts`, `src/models/Submission.ts`, `src/models/PushLog.ts`, `src/models/index.ts`

- [ ] **Step 1: Create `src/models/Event.ts`**

```ts
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const EventSchema = new Schema({
  name: { type: String, required: true },
  joinCode: { type: String, required: true, unique: true, index: true },
  timezone: { type: String, default: "Asia/Bangkok" },
  startAt: { type: Date, required: true },
  endAt: { type: Date, required: true },
  status: { type: String, enum: ["draft", "live", "ended", "revealed"], default: "draft", index: true },
  adminIds: { type: [String], default: [] },
  settings: { allowRetake: { type: Boolean, default: true } },
  createdAt: { type: Date, default: () => new Date() },
});

export type EventDoc = InferSchemaType<typeof EventSchema> & { _id: import("mongoose").Types.ObjectId };
export const Event: Model<EventDoc> =
  (models.Event as Model<EventDoc>) ?? model<EventDoc>("Event", EventSchema);
```

- [ ] **Step 2: Create `src/models/Topic.ts`**

```ts
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const TopicSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
  title: { type: String, required: true },
  description: { type: String },
  scheduledAt: { type: Date, required: true },
  closeAt: { type: Date, required: true }, // = scheduledAt + windowMinutes
  windowMinutes: { type: Number, default: 30 },
  status: { type: String, enum: ["scheduled", "open", "closed"], default: "scheduled", index: true },
  pushSentAt: { type: Date, default: null },
  order: { type: Number, default: 0 },
});
TopicSchema.index({ eventId: 1, scheduledAt: 1 });

export type TopicDoc = InferSchemaType<typeof TopicSchema> & { _id: import("mongoose").Types.ObjectId };
export const Topic: Model<TopicDoc> =
  (models.Topic as Model<TopicDoc>) ?? model<TopicDoc>("Topic", TopicSchema);
```

- [ ] **Step 3: Create `src/models/Player.ts`**

```ts
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const PlayerSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
  lineUserId: { type: String, required: true },
  displayName: { type: String, default: "" },
  pictureUrl: { type: String, default: "" },
  isBotFriend: { type: Boolean, default: false },
  joinedAt: { type: Date, default: () => new Date() },
});
PlayerSchema.index({ eventId: 1, lineUserId: 1 }, { unique: true });

export type PlayerDoc = InferSchemaType<typeof PlayerSchema> & { _id: import("mongoose").Types.ObjectId };
export const Player: Model<PlayerDoc> =
  (models.Player as Model<PlayerDoc>) ?? model<PlayerDoc>("Player", PlayerSchema);
```

- [ ] **Step 4: Create `src/models/Submission.ts`**

```ts
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const SubmissionSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true, index: true },
  topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
  playerId: { type: Schema.Types.ObjectId, ref: "Player", required: true },
  lineUserId: { type: String, required: true },
  mediaType: { type: String, default: "image" }, // future: "video"
  imageUrl: { type: String, required: true },
  thumbnailUrl: { type: String, required: true },
  capturedAt: { type: Date, required: true },
  createdAt: { type: Date, default: () => new Date() },
});
SubmissionSchema.index({ topicId: 1, playerId: 1 }, { unique: true });

export type SubmissionDoc = InferSchemaType<typeof SubmissionSchema> & { _id: import("mongoose").Types.ObjectId };
export const Submission: Model<SubmissionDoc> =
  (models.Submission as Model<SubmissionDoc>) ?? model<SubmissionDoc>("Submission", SubmissionSchema);
```

- [ ] **Step 5: Create `src/models/PushLog.ts`**

```ts
import { Schema, model, models, type InferSchemaType, type Model } from "mongoose";

const PushLogSchema = new Schema({
  eventId: { type: Schema.Types.ObjectId, ref: "Event", required: true },
  topicId: { type: Schema.Types.ObjectId, ref: "Topic", required: true },
  type: { type: String, default: "topic_open" },
  sentAt: { type: Date, default: () => new Date() },
  success: { type: Boolean, default: true },
  error: { type: String },
});

export type PushLogDoc = InferSchemaType<typeof PushLogSchema> & { _id: import("mongoose").Types.ObjectId };
export const PushLog: Model<PushLogDoc> =
  (models.PushLog as Model<PushLogDoc>) ?? model<PushLogDoc>("PushLog", PushLogSchema);
```

- [ ] **Step 6: Create `src/models/index.ts`**

```ts
export { Event, type EventDoc } from "./Event";
export { Topic, type TopicDoc } from "./Topic";
export { Player, type PlayerDoc } from "./Player";
export { Submission, type SubmissionDoc } from "./Submission";
export { PushLog, type PushLogDoc } from "./PushLog";
```

- [ ] **Step 7: Verify models compile**

Run: `npx tsc --noEmit`
Expected: no type errors in `src/models`.

- [ ] **Step 8: Commit**

```bash
git add src/models
git commit -m "feat: add mongoose models with indexes"
```

---

### Task 1.3: Time helpers and DTO serializers

**Files:** Create: `src/lib/time.ts`, `src/lib/dto.ts`

- [ ] **Step 1: Create `src/lib/time.ts`**

```ts
import { DateTime } from "luxon";

/** Convert a wall-clock local datetime in `tz` to a UTC Date. `local` is "YYYY-MM-DDTHH:mm". */
export function localToUtc(local: string, tz: string): Date {
  const dt = DateTime.fromISO(local, { zone: tz });
  if (!dt.isValid) throw new Error("invalid datetime: " + local);
  return dt.toUTC().toJSDate();
}

/** Convert a UTC Date to a "YYYY-MM-DDTHH:mm" string in `tz` (for datetime-local inputs). */
export function utcToLocalInput(date: Date, tz: string): string {
  return DateTime.fromJSDate(date).setZone(tz).toFormat("yyyy-MM-dd'T'HH:mm");
}

/** Human label like "30 May, 14:30 (Asia/Bangkok)". */
export function formatInTz(date: Date, tz: string): string {
  return DateTime.fromJSDate(date).setZone(tz).toFormat("dd LLL, HH:mm") + ` (${tz})`;
}
```

- [ ] **Step 2: Create `src/lib/dto.ts`**

```ts
import type { EventDoc, TopicDoc } from "@/models";
import type { EventDTO, TopicDTO } from "@/types";

export function eventToDTO(e: EventDoc): EventDTO {
  return {
    id: String(e._id),
    name: e.name,
    joinCode: e.joinCode,
    timezone: e.timezone,
    startAt: e.startAt.toISOString(),
    endAt: e.endAt.toISOString(),
    status: e.status,
    settings: { allowRetake: e.settings?.allowRetake ?? true },
  };
}

export function topicToDTO(t: TopicDoc): TopicDTO {
  return {
    id: String(t._id),
    eventId: String(t.eventId),
    title: t.title,
    description: t.description ?? undefined,
    scheduledAt: t.scheduledAt.toISOString(),
    closeAt: t.closeAt.toISOString(),
    windowMinutes: t.windowMinutes,
    status: t.status,
    order: t.order,
  };
}
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/lib/time.ts src/lib/dto.ts
git commit -m "feat: add timezone helpers and DTO serializers"
```

---

## Phase 2 — Admin Auth (LINE OAuth + allowlist + session)

### Task 2.1: Session helper

**Files:** Create: `src/lib/session.ts`

- [ ] **Step 1: Create `src/lib/session.ts`**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/session.ts
git commit -m "feat: add iron-session admin session helper"
```

---

### Task 2.2: LINE Login OAuth client + id_token verification

**Files:** Create: `src/lib/lineLogin.ts`

- [ ] **Step 1: Create `src/lib/lineLogin.ts`**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/lineLogin.ts
git commit -m "feat: add LINE Login OAuth client with id_token verification"
```

---

### Task 2.3: Admin auth routes

**Files:** Create: `src/app/api/admin/auth/login/route.ts`, `src/app/api/admin/auth/callback/route.ts`, `src/app/api/admin/auth/logout/route.ts`

- [ ] **Step 1: Create `login/route.ts`**

```ts
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
```

- [ ] **Step 2: Create `callback/route.ts`**

```ts
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
  } catch {
    return NextResponse.redirect(env().APP_BASE_URL.replace(/\/$/, "") + "/admin?error=auth");
  }
}
```

- [ ] **Step 3: Create `logout/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getAdminSession } from "@/lib/session";
import { env } from "@/lib/env";

export const runtime = "nodejs";

export async function POST() {
  const session = await getAdminSession();
  session.destroy();
  return NextResponse.redirect(env().APP_BASE_URL.replace(/\/$/, "") + "/admin", { status: 303 });
}
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/auth
git commit -m "feat: add admin LINE OAuth login/callback/logout routes"
```

---

### Task 2.4: Admin guard

**Files:** Create: `src/lib/auth-guards.ts`

- [ ] **Step 1: Create `src/lib/auth-guards.ts`**

```ts
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
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/auth-guards.ts
git commit -m "feat: add admin auth guards"
```

---

### Task 2.5: Admin login page

**Files:** Create: `src/app/admin/page.tsx`, `src/components/ui/Button.tsx`

- [ ] **Step 1: Create `src/components/ui/Button.tsx`**

```tsx
"use client";
import { theme } from "@/theme/tokens";

export function Button(
  props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }
) {
  const { variant = "primary", style, ...rest } = props;
  return (
    <button
      {...rest}
      style={{
        width: "100%",
        padding: "16px",
        fontSize: 18,
        fontWeight: 700,
        borderRadius: theme.radius,
        border: "none",
        cursor: "pointer",
        color: variant === "primary" ? "#fff" : "#1A1A2E",
        background: variant === "primary" ? theme.gradients.party : "#EEE",
        ...style,
      }}
    />
  );
}
```

- [ ] **Step 2: Create `src/app/admin/page.tsx`**

```tsx
import { isAdmin } from "@/lib/auth-guards";
import { redirect } from "next/navigation";

export default async function AdminLogin({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  if (await isAdmin()) redirect("/admin/events");
  const { error } = await searchParams;
  return (
    <main style={{ padding: 24, display: "grid", gap: 20, alignContent: "center", minHeight: "100vh" }}>
      <h1 style={{ fontSize: 32, fontWeight: 800 }}>Crew Quest Admin</h1>
      {error === "forbidden" && <p style={{ color: "#D64545" }}>That LINE account is not on the allowlist.</p>}
      {error && error !== "forbidden" && <p style={{ color: "#D64545" }}>Login failed. Try again.</p>}
      <a href="/api/admin/auth/login">
        <button
          style={{
            width: "100%", padding: 16, fontSize: 18, fontWeight: 700,
            borderRadius: "1.25rem", border: "none", color: "#fff",
            background: "#06C755", cursor: "pointer",
          }}
        >
          Log in with LINE
        </button>
      </a>
    </main>
  );
}
```

- [ ] **Step 3: Verify**

Run `npm run dev`, visit `http://localhost:3000/admin`. Expected: login page renders with a "Log in with LINE" button. (Full OAuth requires real LINE credentials.)

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/page.tsx src/components/ui/Button.tsx
git commit -m "feat: add admin login page and Button component"
```

---

## Phase 3 — Admin Event/Topic Management

### Task 3.1: Join code generator + create-event API

**Files:** Create: `src/lib/joinCode.ts`, `src/app/api/events/route.ts`

- [ ] **Step 1: Create `src/lib/joinCode.ts`**

```ts
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars

export function generateJoinCode(len = 6): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
  return out;
}
```

- [ ] **Step 2: Create `src/app/api/events/route.ts`**

```ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event } from "@/models";
import { requireAdmin, AuthError } from "@/lib/auth-guards";
import { generateJoinCode } from "@/lib/joinCode";
import { localToUtc } from "@/lib/time";
import { eventToDTO } from "@/lib/dto";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

const CreateSchema = z.object({
  name: z.string().min(1),
  timezone: z.string().default("Asia/Bangkok"),
  startAtLocal: z.string(), // "YYYY-MM-DDTHH:mm" in timezone
  endAtLocal: z.string(),
  allowRetake: z.boolean().default(true),
});

export async function POST(req: NextRequest) {
  try {
    const adminId = await requireAdmin();
    await dbConnect();
    const body = CreateSchema.parse(await req.json());

    // Retry join-code generation on the rare unique collision.
    let joinCode = generateJoinCode();
    for (let i = 0; i < 5; i++) {
      if (!(await Event.exists({ joinCode }))) break;
      joinCode = generateJoinCode();
    }

    const ev = await Event.create({
      name: body.name,
      timezone: body.timezone,
      joinCode,
      startAt: localToUtc(body.startAtLocal, body.timezone),
      endAt: localToUtc(body.endAtLocal, body.timezone),
      status: "draft",
      adminIds: [adminId],
      settings: { allowRetake: body.allowRetake },
    });
    return ok(eventToDTO(ev), 201);
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, e.status);
    return fail((e as Error).message, 400);
  }
}

export async function GET() {
  try {
    await requireAdmin();
    await dbConnect();
    const events = await Event.find().sort({ createdAt: -1 });
    return ok(events.map(eventToDTO));
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, e.status);
    return fail((e as Error).message, 400);
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/joinCode.ts src/app/api/events/route.ts
git commit -m "feat: add event create/list API"
```

---

### Task 3.2: Topics API (create/list/update)

**Files:** Create: `src/app/api/events/[id]/topics/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Topic } from "@/models";
import { requireAdmin, AuthError } from "@/lib/auth-guards";
import { localToUtc } from "@/lib/time";
import { topicToDTO } from "@/lib/dto";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

const TopicInput = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  scheduledAtLocal: z.string(),
  windowMinutes: z.number().int().positive().default(30),
  order: z.number().int().default(0),
});

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    await dbConnect();
    const { id } = await params;
    const ev = await Event.findById(id);
    if (!ev) return fail("event not found", 404);

    const body = TopicInput.parse(await req.json());
    const scheduledAt = localToUtc(body.scheduledAtLocal, ev.timezone);
    const closeAt = new Date(scheduledAt.getTime() + body.windowMinutes * 60_000);

    const topic = await Topic.create({
      eventId: ev._id,
      title: body.title,
      description: body.description,
      scheduledAt,
      closeAt,
      windowMinutes: body.windowMinutes,
      order: body.order,
      status: "scheduled",
    });
    return ok(topicToDTO(topic), 201);
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, e.status);
    return fail((e as Error).message, 400);
  }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    await dbConnect();
    const { id } = await params;
    const topics = await Topic.find({ eventId: id }).sort({ scheduledAt: 1 });
    return ok(topics.map(topicToDTO));
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, e.status);
    return fail((e as Error).message, 400);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/events/[id]/topics/route.ts
git commit -m "feat: add topics create/list API with UTC conversion"
```

---

### Task 3.3: Admin shell + events list page

**Files:** Create: `src/components/admin/AdminShell.tsx`, `src/app/admin/events/page.tsx`, `src/components/admin/EventForm.tsx`

- [ ] **Step 1: Create `src/components/admin/AdminShell.tsx`**

```tsx
export function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main style={{ padding: 20, maxWidth: 720, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>{title}</h1>
        <form action="/api/admin/auth/logout" method="post">
          <button style={{ border: "none", background: "transparent", color: "#888", cursor: "pointer" }}>
            Log out
          </button>
        </form>
      </header>
      {children}
    </main>
  );
}
```

- [ ] **Step 2: Create `src/components/admin/EventForm.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";

export function EventForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setErr("");
    const f = new FormData(e.currentTarget);
    const res = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: f.get("name"),
        timezone: f.get("timezone"),
        startAtLocal: f.get("startAtLocal"),
        endAtLocal: f.get("endAtLocal"),
        allowRetake: f.get("allowRetake") === "on",
      }),
    });
    const json = await res.json();
    setBusy(false);
    if (json.ok) router.push(`/admin/events/${json.data.id}`);
    else setErr(json.error);
  }

  const field = { padding: 12, borderRadius: 12, border: "1px solid #DDD", fontSize: 16 } as const;
  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 12, marginBottom: 24 }}>
      <input name="name" placeholder="Event name" required style={field} />
      <input name="timezone" defaultValue="Asia/Bangkok" style={field} />
      <label style={{ fontSize: 13, color: "#666" }}>Start</label>
      <input name="startAtLocal" type="datetime-local" required style={field} />
      <label style={{ fontSize: 13, color: "#666" }}>End</label>
      <input name="endAtLocal" type="datetime-local" required style={field} />
      <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <input name="allowRetake" type="checkbox" defaultChecked /> Allow one retake
      </label>
      {err && <p style={{ color: "#D64545" }}>{err}</p>}
      <Button disabled={busy}>{busy ? "Creating…" : "Create event"}</Button>
    </form>
  );
}
```

- [ ] **Step 3: Create `src/app/admin/events/page.tsx`**

```tsx
import { isAdmin } from "@/lib/auth-guards";
import { redirect } from "next/navigation";
import { dbConnect } from "@/lib/db";
import { Event } from "@/models";
import { eventToDTO } from "@/lib/dto";
import { AdminShell } from "@/components/admin/AdminShell";
import { EventForm } from "@/components/admin/EventForm";
import Link from "next/link";

export default async function EventsPage() {
  if (!(await isAdmin())) redirect("/admin");
  await dbConnect();
  const events = (await Event.find().sort({ createdAt: -1 })).map(eventToDTO);
  return (
    <AdminShell title="Events">
      <EventForm />
      <div style={{ display: "grid", gap: 10 }}>
        {events.map((e) => (
          <Link key={e.id} href={`/admin/events/${e.id}`} style={{ textDecoration: "none", color: "inherit" }}>
            <div style={{ padding: 16, borderRadius: 16, background: "#fff", boxShadow: "0 2px 8px rgba(0,0,0,.06)" }}>
              <strong>{e.name}</strong> · code {e.joinCode} · {e.status}
            </div>
          </Link>
        ))}
        {events.length === 0 && <p style={{ color: "#888" }}>No events yet. Create one above.</p>}
      </div>
    </AdminShell>
  );
}
```

- [ ] **Step 4: Verify**

With an admin session (or temporarily stub `isAdmin` to return true for local testing), visit `/admin/events`, create an event. Expected: redirect to the event detail page and the event appears in the list. Also: `curl -X POST localhost:3000/api/events` without a session returns `{"ok":false,"error":"not authorized"}` with status 401.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/AdminShell.tsx src/components/admin/EventForm.tsx src/app/admin/events/page.tsx
git commit -m "feat: add admin events list + create form"
```

---

### Task 3.4: Event detail page (topic scheduler + counts + reveal trigger)

**Files:** Create: `src/components/admin/TopicScheduler.tsx`, `src/components/admin/SubmissionCounts.tsx`, `src/app/admin/events/[id]/page.tsx`

- [ ] **Step 1: Create `src/components/admin/TopicScheduler.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { TopicDTO } from "@/types";

export function TopicScheduler({ eventId, topics }: { eventId: string; topics: TopicDTO[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const res = await fetch(`/api/events/${eventId}/topics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: f.get("title"),
        description: f.get("description") || undefined,
        scheduledAtLocal: f.get("scheduledAtLocal"),
        windowMinutes: Number(f.get("windowMinutes")),
        order: topics.length,
      }),
    });
    setBusy(false);
    if ((await res.json()).ok) {
      (e.target as HTMLFormElement).reset();
      router.refresh();
    }
  }

  const field = { padding: 10, borderRadius: 10, border: "1px solid #DDD", fontSize: 15 } as const;
  return (
    <section style={{ display: "grid", gap: 12 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700 }}>Topics</h2>
      <div style={{ display: "grid", gap: 8 }}>
        {topics.map((t) => (
          <div key={t.id} style={{ padding: 12, borderRadius: 12, background: "#fff" }}>
            <strong>{t.title}</strong> — {new Date(t.scheduledAt).toLocaleString()} · {t.windowMinutes}m · {t.status}
          </div>
        ))}
      </div>
      <form onSubmit={add} style={{ display: "grid", gap: 8, padding: 12, borderRadius: 12, background: "#F4F4F8" }}>
        <input name="title" placeholder="Topic title" required style={field} />
        <input name="description" placeholder="Description (optional)" style={field} />
        <input name="scheduledAtLocal" type="datetime-local" required style={field} />
        <input name="windowMinutes" type="number" defaultValue={30} min={1} style={field} />
        <Button disabled={busy}>{busy ? "Adding…" : "Add topic"}</Button>
      </form>
    </section>
  );
}
```

- [ ] **Step 2: Create `src/components/admin/SubmissionCounts.tsx`**

```tsx
import type { TopicDTO } from "@/types";

export function SubmissionCounts({
  topics,
  counts,
  players,
}: {
  topics: TopicDTO[];
  counts: Record<string, number>;
  players: number;
}) {
  return (
    <section style={{ marginTop: 20 }}>
      <h2 style={{ fontSize: 20, fontWeight: 700 }}>Submissions ({players} players)</h2>
      <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
        {topics.map((t) => (
          <div key={t.id} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{t.title}</span>
            <strong>{counts[t.id] ?? 0}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: Create `src/app/admin/events/[id]/page.tsx`**

```tsx
import { isAdmin } from "@/lib/auth-guards";
import { redirect } from "next/navigation";
import { dbConnect } from "@/lib/db";
import { Event, Topic, Player, Submission } from "@/models";
import { eventToDTO, topicToDTO } from "@/lib/dto";
import { AdminShell } from "@/components/admin/AdminShell";
import { TopicScheduler } from "@/components/admin/TopicScheduler";
import { SubmissionCounts } from "@/components/admin/SubmissionCounts";
import { RevealButton } from "@/components/admin/RevealButton";

export default async function EventDetail({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isAdmin())) redirect("/admin");
  await dbConnect();
  const { id } = await params;
  const ev = await Event.findById(id);
  if (!ev) return <AdminShell title="Not found">Event not found.</AdminShell>;

  const topics = (await Topic.find({ eventId: id }).sort({ scheduledAt: 1 })).map(topicToDTO);
  const players = await Player.countDocuments({ eventId: id });
  const agg = await Submission.aggregate<{ _id: unknown; n: number }>([
    { $match: { eventId: ev._id } },
    { $group: { _id: "$topicId", n: { $sum: 1 } } },
  ]);
  const counts: Record<string, number> = {};
  for (const row of agg) counts[String(row._id)] = row.n;

  const dto = eventToDTO(ev);
  return (
    <AdminShell title={dto.name}>
      <p style={{ color: "#666" }}>
        Join code <strong>{dto.joinCode}</strong> · status {dto.status} · {dto.timezone}
      </p>
      <TopicScheduler eventId={id} topics={topics} />
      <SubmissionCounts topics={topics} counts={counts} players={players} />
      <RevealButton eventId={id} status={dto.status} />
    </AdminShell>
  );
}
```

> Note: `RevealButton` is created in Task 7.1. Until then, comment out its import and usage, or create a temporary stub returning `null`. The reveal API it calls is also added in Phase 7.

- [ ] **Step 4: Verify**

Visit an event detail page, add a topic scheduled a few minutes ahead. Expected: topic appears with its local time and "scheduled" status; submission counts show 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/TopicScheduler.tsx src/components/admin/SubmissionCounts.tsx src/app/admin/events/[id]/page.tsx
git commit -m "feat: add event detail page with topic scheduler and counts"
```

---

## Phase 4 — Player Onboarding (LIFF + Join)

### Task 4.1: LIFF client wrapper + server id-token verification

**Files:** Create: `src/lib/liff.ts`, `src/lib/liffVerify.ts`

- [ ] **Step 1: Create `src/lib/liff.ts`** (client-side)

```ts
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
  const idToken = liff.getIDToken() ?? "";
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
```

- [ ] **Step 2: Create `src/lib/liffVerify.ts`** (server-side)

```ts
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
```

> Setup note for README: the LIFF app and the LINE Login channel used for `client_id` must belong to the same provider; the Messaging API OA must also be under that provider for `getFriendship()` and pushes to work.

- [ ] **Step 3: Commit**

```bash
git add src/lib/liff.ts src/lib/liffVerify.ts
git commit -m "feat: add LIFF client wrapper and server id-token verification"
```

---

### Task 4.2: Join API

**Files:** Create: `src/app/api/events/[id]/join/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest } from "next/server";
import { z } from "zod";
import { dbConnect } from "@/lib/db";
import { Event, Player } from "@/models";
import { verifyLiffIdToken } from "@/lib/liffVerify";
import { eventToDTO } from "@/lib/dto";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

const JoinSchema = z.object({
  idToken: z.string().min(1),
  displayName: z.string().default(""),
  pictureUrl: z.string().optional(),
  isBotFriend: z.boolean().default(false),
});

// `id` here may be an event _id OR a join code.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();
    const { id } = await params;
    const body = JoinSchema.parse(await req.json());
    const verified = await verifyLiffIdToken(body.idToken);

    const ev =
      (await Event.findOne({ joinCode: id.toUpperCase() })) ||
      (id.match(/^[a-f0-9]{24}$/i) ? await Event.findById(id) : null);
    if (!ev) return fail("event not found", 404);

    const player = await Player.findOneAndUpdate(
      { eventId: ev._id, lineUserId: verified.sub },
      {
        $set: {
          displayName: body.displayName || verified.name,
          pictureUrl: body.pictureUrl ?? verified.picture ?? "",
          isBotFriend: body.isBotFriend,
        },
        $setOnInsert: { joinedAt: new Date() },
      },
      { upsert: true, new: true }
    );

    return ok({ event: eventToDTO(ev), playerId: String(player._id) });
  } catch (e) {
    return fail((e as Error).message, 400);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/events/[id]/join/route.ts
git commit -m "feat: add player join API with id-token verification"
```

---

### Task 4.3: Join page, AddBotPrompt, LIFF entry routing

**Files:** Create: `src/components/player/AddBotPrompt.tsx`, `src/components/player/JoinForm.tsx`, `src/components/ui/Spinner.tsx`, `src/app/join/page.tsx`, `src/app/page.tsx`

- [ ] **Step 1: Create `src/components/ui/Spinner.tsx`**

```tsx
export function Spinner() {
  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh" }}>
      <div
        style={{
          width: 40, height: 40, borderRadius: "50%",
          border: "4px solid #EEE", borderTopColor: "#FF6B9D",
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/player/AddBotPrompt.tsx`**

```tsx
import { theme } from "@/theme/tokens";

export function AddBotPrompt({ botBasicId }: { botBasicId: string }) {
  const href = botBasicId ? `https://line.me/R/ti/p/${encodeURIComponent(botBasicId)}` : "#";
  return (
    <div style={{ padding: 16, borderRadius: theme.radius, background: "#FFF6E5", margin: "12px 0" }}>
      <p style={{ margin: 0, fontWeight: 700 }}>📣 Add our LINE bot to get photo alerts</p>
      <p style={{ margin: "6px 0 12px", fontSize: 14, color: "#876" }}>
        You won&apos;t receive topic notifications until you add us as a friend.
      </p>
      <a href={href} target="_blank" rel="noreferrer">
        <button style={{ padding: "10px 16px", borderRadius: 12, border: "none", background: "#06C755", color: "#fff", fontWeight: 700 }}>
          Add friend
        </button>
      </a>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/player/JoinForm.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ensureLogin } from "@/lib/liff";
import { Button } from "@/components/ui/Button";

export function JoinForm({ initialCode }: { initialCode?: string }) {
  const router = useRouter();
  const [code, setCode] = useState(initialCode ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function join() {
    setBusy(true);
    setErr("");
    try {
      const p = await ensureLogin();
      const res = await fetch(`/api/events/${encodeURIComponent(code.trim())}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idToken: p.idToken,
          displayName: p.displayName,
          pictureUrl: p.pictureUrl,
          isBotFriend: p.isBotFriend,
        }),
      });
      const json = await res.json();
      if (json.ok) router.replace(`/event/${json.data.event.id}`);
      else setErr(json.error);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 14, padding: 24 }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Join the game</h1>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="Enter join code"
        style={{ padding: 16, fontSize: 22, letterSpacing: 4, textAlign: "center", borderRadius: 16, border: "2px solid #EEE" }}
      />
      {err && <p style={{ color: "#D64545" }}>{err}</p>}
      <Button disabled={busy || !code} onClick={join}>{busy ? "Joining…" : "Join"}</Button>
    </div>
  );
}
```

- [ ] **Step 4: Create `src/app/join/page.tsx`**

```tsx
import { JoinForm } from "@/components/player/JoinForm";

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event } = await searchParams;
  return <JoinForm initialCode={event} />;
}
```

- [ ] **Step 5: Create `src/app/page.tsx`** (LIFF entry: init, auth, route)

```tsx
"use client";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ensureLogin } from "@/lib/liff";
import { Spinner } from "@/components/ui/Spinner";

export default function Entry() {
  const router = useRouter();
  const search = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        await ensureLogin();
        const eventParam = search.get("event");
        // Deep-link with ?event=<code|id> goes straight to join.
        router.replace(eventParam ? `/join?event=${encodeURIComponent(eventParam)}` : "/join");
      } catch (e) {
        setError((e as Error).message);
      }
    })();
  }, [router, search]);

  if (error) return <p style={{ padding: 24, color: "#D64545" }}>Could not start: {error}</p>;
  return <Spinner />;
}
```

- [ ] **Step 6: Verify**

In LINE's LIFF inspector or a real device, open the LIFF URL. Expected: it initializes, logs in, and routes to `/join`. With a valid join code, joining lands on `/event/[id]`. (Requires a real `NEXT_PUBLIC_LIFF_ID`.) For non-LINE local dev, the LIFF init will error — that's expected outside LINE.

- [ ] **Step 7: Commit**

```bash
git add src/components/player/AddBotPrompt.tsx src/components/player/JoinForm.tsx src/components/ui/Spinner.tsx src/app/join/page.tsx src/app/page.tsx
git commit -m "feat: add LIFF entry, join page, add-bot prompt"
```

---

## Phase 5 — Active Topic & Live-Capture Submission

### Task 5.1: DigitalOcean Spaces storage client

**Files:** Create: `src/lib/storage.ts`

- [ ] **Step 1: Create `src/lib/storage.ts`**

```ts
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { env } from "@/lib/env";

let client: S3Client | null = null;

function s3(): S3Client {
  if (client) return client;
  const e = env();
  client = new S3Client({
    endpoint: e.SPACES_ENDPOINT,
    region: e.SPACES_REGION,
    credentials: { accessKeyId: e.SPACES_KEY, secretAccessKey: e.SPACES_SECRET },
    forcePathStyle: false,
  });
  return client;
}

/** Uploads a buffer and returns the public URL. */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  const e = env();
  await s3().send(
    new PutObjectCommand({
      Bucket: e.SPACES_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      ACL: "public-read",
    })
  );
  if (e.SPACES_CDN_BASE_URL) return `${e.SPACES_CDN_BASE_URL.replace(/\/$/, "")}/${key}`;
  // Default DO Spaces object URL: https://<bucket>.<region>.digitaloceanspaces.com/<key>
  const host = e.SPACES_ENDPOINT.replace(/^https?:\/\//, "");
  return `https://${e.SPACES_BUCKET}.${host}/${key}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/storage.ts
git commit -m "feat: add DigitalOcean Spaces storage client"
```

---

### Task 5.2: Image processing (sharp)

**Files:** Create: `src/lib/images.ts`

- [ ] **Step 1: Create `src/lib/images.ts`**

```ts
import sharp from "sharp";

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  contentType: "image/jpeg";
}

/**
 * Validate that `input` decodes as a real image, auto-orient it, and produce
 * a full-size (max 1600px) and thumbnail (max 400px) JPEG. Throws on non-images.
 */
export async function processImage(input: Buffer): Promise<ProcessedImage> {
  const base = sharp(input, { failOn: "error" }).rotate(); // auto-orient via EXIF, then strip metadata
  const meta = await base.metadata();
  if (!meta.width || !meta.height) throw new Error("not a valid image");

  const full = await base.clone().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer();
  const thumb = await base.clone().resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 70 }).toBuffer();
  return { full, thumb, contentType: "image/jpeg" };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/images.ts
git commit -m "feat: add sharp image validation and thumbnail generation"
```

---

### Task 5.3: Active-topic API

**Files:** Create: `src/app/api/events/[id]/active-topic/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest } from "next/server";
import { dbConnect } from "@/lib/db";
import { Event, Topic, Player, Submission } from "@/models";
import { verifyLiffIdToken } from "@/lib/liffVerify";
import { topicToDTO } from "@/lib/dto";
import { ok, fail } from "@/lib/http";
import type { ActiveTopicDTO } from "@/types";

export const runtime = "nodejs";

// Player passes their idToken via header for identity (never trust a raw userId).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();
    const { id } = await params;
    const idToken = req.headers.get("x-line-id-token") ?? "";
    if (!idToken) return fail("missing id token", 401);
    const verified = await verifyLiffIdToken(idToken);

    const ev = await Event.findById(id);
    if (!ev) return fail("event not found", 404);
    const player = await Player.findOne({ eventId: ev._id, lineUserId: verified.sub });
    if (!player) return fail("not joined", 403);

    const now = new Date();
    // Active topic = currently open AND within window (server clock only).
    const active = await Topic.findOne({
      eventId: ev._id,
      status: "open",
      scheduledAt: { $lte: now },
      closeAt: { $gt: now },
    }).sort({ scheduledAt: 1 });

    const total = await Topic.countDocuments({ eventId: ev._id });
    const completed = await Submission.countDocuments({ eventId: ev._id, playerId: player._id });

    let alreadySubmitted = false;
    if (active) {
      alreadySubmitted = !!(await Submission.exists({ topicId: active._id, playerId: player._id }));
    }

    const payload: ActiveTopicDTO = {
      topic: active ? topicToDTO(active) : null,
      serverNow: now.toISOString(),
      alreadySubmitted,
      completed,
      total,
    };
    return ok(payload);
  } catch (e) {
    return fail((e as Error).message, 400);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/events/[id]/active-topic/route.ts
git commit -m "feat: add server-authoritative active-topic API"
```

---

### Task 5.4: Submissions API (server enforcement + upload)

**Files:** Create: `src/app/api/submissions/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest } from "next/server";
import { dbConnect } from "@/lib/db";
import { Event, Topic, Player, Submission } from "@/models";
import { verifyLiffIdToken } from "@/lib/liffVerify";
import { processImage } from "@/lib/images";
import { putObject } from "@/lib/storage";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB cap

export async function POST(req: NextRequest) {
  try {
    await dbConnect();
    const form = await req.formData();
    const idToken = String(form.get("idToken") ?? "");
    const eventId = String(form.get("eventId") ?? "");
    const topicId = String(form.get("topicId") ?? "");
    const file = form.get("photo");

    if (!idToken || !eventId || !topicId || !(file instanceof Blob)) {
      return fail("missing fields", 400);
    }
    if (file.size > MAX_BYTES) return fail("image too large", 413);

    const verified = await verifyLiffIdToken(idToken);

    const ev = await Event.findById(eventId);
    if (!ev) return fail("event not found", 404);
    const player = await Player.findOne({ eventId, lineUserId: verified.sub });
    if (!player) return fail("not joined", 403);

    const topic = await Topic.findOne({ _id: topicId, eventId });
    if (!topic) return fail("topic not found", 404);

    // SERVER-AUTHORITATIVE window check — never trust the client clock.
    const now = new Date();
    const isOpen = topic.status === "open" && topic.scheduledAt <= now && topic.closeAt > now;
    if (!isOpen) return fail("submission window is closed", 403);

    // Dedup / retake handling.
    const existing = await Submission.findOne({ topicId, playerId: player._id });
    if (existing && !ev.settings?.allowRetake) {
      return fail("already submitted", 409);
    }

    // Process and upload.
    const buf = Buffer.from(await (file as Blob).arrayBuffer());
    const { full, thumb, contentType } = await processImage(buf);
    const ts = now.getTime();
    const base = `events/${eventId}/topics/${topicId}/${player._id}-${ts}`;
    const [imageUrl, thumbnailUrl] = await Promise.all([
      putObject(`${base}.jpg`, full, contentType),
      putObject(`${base}-thumb.jpg`, thumb, contentType),
    ]);

    if (existing) {
      existing.imageUrl = imageUrl;
      existing.thumbnailUrl = thumbnailUrl;
      existing.capturedAt = now;
      await existing.save();
      return ok({ submissionId: String(existing._id), retake: true });
    }

    try {
      const created = await Submission.create({
        eventId,
        topicId,
        playerId: player._id,
        lineUserId: verified.sub,
        mediaType: "image",
        imageUrl,
        thumbnailUrl,
        capturedAt: now,
      });
      return ok({ submissionId: String(created._id), retake: false }, 201);
    } catch (e) {
      // Unique index (topicId, playerId) → concurrent duplicate.
      if ((e as { code?: number }).code === 11000) return fail("already submitted", 409);
      throw e;
    }
  } catch (e) {
    return fail((e as Error).message, 400);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/api/submissions/route.ts
git commit -m "feat: add submissions API with server-side window, dedup, upload"
```

---

### Task 5.5: Capture camera + confetti components

**Files:** Create: `src/components/Confetti.tsx`, `src/components/player/CaptureCamera.tsx`

- [ ] **Step 1: Create `src/components/Confetti.tsx`**

```tsx
"use client";
import { useEffect } from "react";
import confetti from "canvas-confetti";

export function Confetti({ fire }: { fire: boolean }) {
  useEffect(() => {
    if (!fire) return;
    confetti({ particleCount: 140, spread: 80, origin: { y: 0.6 } });
  }, [fire]);
  return null;
}
```

- [ ] **Step 2: Create `src/components/player/CaptureCamera.tsx`**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/Button";

interface Props {
  onCapture: (blob: Blob) => void;
}

/** Live camera via getUserMedia, with a file-input fallback for restricted in-app browsers. */
export function CaptureCamera({ onCapture }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [unsupported, setUnsupported] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (!active) { s.getTracks().forEach((t) => t.stop()); return; }
        setStream(s);
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play(); }
      } catch {
        setUnsupported(true);
      }
    })();
    return () => { active = false; stream?.getTracks().forEach((t) => t.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function snap() {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    canvas.toBlob((b) => { if (b) onCapture(b); }, "image/jpeg", 0.85);
  }

  if (unsupported) {
    return (
      <div style={{ padding: 24, display: "grid", gap: 12 }}>
        <p>Camera unavailable here — use your camera to take a fresh photo:</p>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) onCapture(f); }}
        />
      </div>
    );
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <video ref={videoRef} playsInline muted style={{ width: "100%", borderRadius: 16, background: "#000" }} />
      <Button onClick={snap}>📸 Capture</Button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/Confetti.tsx src/components/player/CaptureCamera.tsx
git commit -m "feat: add live capture camera and confetti components"
```

---

### Task 5.6: Capture page

**Files:** Create: `src/app/event/[id]/capture/[topicId]/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
"use client";
import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ensureLogin } from "@/lib/liff";
import { CaptureCamera } from "@/components/player/CaptureCamera";
import { Confetti } from "@/components/Confetti";
import { Button } from "@/components/ui/Button";

export default function CapturePage() {
  const { id, topicId } = useParams<{ id: string; topicId: string }>();
  const router = useRouter();
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");

  function onCapture(blob: Blob) {
    setPreview({ blob, url: URL.createObjectURL(blob) });
  }

  async function submit() {
    if (!preview) return;
    setBusy(true);
    setErr("");
    try {
      const p = await ensureLogin();
      const fd = new FormData();
      fd.set("idToken", p.idToken);
      fd.set("eventId", id);
      fd.set("topicId", topicId);
      fd.set("photo", preview.blob, "capture.jpg");
      const res = await fetch("/api/submissions", { method: "POST", body: fd });
      const json = await res.json();
      if (json.ok) {
        setDone(true);
        setTimeout(() => router.replace(`/event/${id}`), 1800);
      } else setErr(json.error);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ padding: 20, display: "grid", gap: 16 }}>
      <Confetti fire={done} />
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Capture the moment</h1>
      {done ? (
        <p style={{ fontSize: 20 }}>🎉 Submitted! Redirecting…</p>
      ) : preview ? (
        <>
          <img src={preview.url} alt="preview" style={{ width: "100%", borderRadius: 16 }} />
          {err && <p style={{ color: "#D64545" }}>{err}</p>}
          <Button onClick={submit} disabled={busy}>{busy ? "Uploading…" : "Use this photo"}</Button>
          <Button variant="ghost" onClick={() => setPreview(null)} disabled={busy}>Retake</Button>
        </>
      ) : (
        <CaptureCamera onCapture={onCapture} />
      )}
    </main>
  );
}
```

- [ ] **Step 2: Verify**

In LINE, open an event with an OPEN topic, capture and submit. Expected: image uploads to Spaces, confetti fires, redirect to event home. Verify the object exists in your Spaces bucket and `Submission` doc was created. Submitting after `closeAt` returns "submission window is closed".

- [ ] **Step 3: Commit**

```bash
git add src/app/event/[id]/capture/[topicId]/page.tsx
git commit -m "feat: add capture page with preview and submit"
```

---

### Task 5.7: Player home (active topic, countdown, progress)

**Files:** Create: `src/components/ui/CountdownRing.tsx`, `src/components/ui/ProgressBar.tsx`, `src/components/player/TopicCard.tsx`, `src/components/player/ProgressHeader.tsx`, `src/app/event/[id]/page.tsx`

- [ ] **Step 1: Create `src/components/ui/CountdownRing.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";

/** Counts down to `deadline` (ISO). Pure display; server owns the real cutoff. */
export function CountdownRing({ deadline }: { deadline: string }) {
  const [remaining, setRemaining] = useState(() => Math.max(0, new Date(deadline).getTime() - Date.now()));
  useEffect(() => {
    const t = setInterval(() => {
      setRemaining(Math.max(0, new Date(deadline).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(t);
  }, [deadline]);
  const mm = Math.floor(remaining / 60000);
  const ss = Math.floor((remaining % 60000) / 1000).toString().padStart(2, "0");
  return (
    <div style={{ fontSize: 40, fontWeight: 800, color: remaining < 60000 ? "#D64545" : "#1A1A2E" }}>
      {mm}:{ss}
    </div>
  );
}
```

- [ ] **Step 2: Create `src/components/ui/ProgressBar.tsx`**

```tsx
export function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div style={{ height: 10, borderRadius: 999, background: "#EEE", overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#FF6B9D,#FFC371)" }} />
      </div>
      <p style={{ fontSize: 13, color: "#888", marginTop: 6 }}>You&apos;ve completed {value} / {total} topics</p>
    </div>
  );
}
```

- [ ] **Step 3: Create `src/components/player/ProgressHeader.tsx`**

```tsx
import { ProgressBar } from "@/components/ui/ProgressBar";

export function ProgressHeader({ completed, total }: { completed: number; total: number }) {
  return (
    <div style={{ padding: "8px 0 16px" }}>
      <ProgressBar value={completed} total={total} />
    </div>
  );
}
```

- [ ] **Step 4: Create `src/components/player/TopicCard.tsx`**

```tsx
"use client";
import { useRouter } from "next/navigation";
import { CountdownRing } from "@/components/ui/CountdownRing";
import { Button } from "@/components/ui/Button";
import { theme } from "@/theme/tokens";
import type { TopicDTO } from "@/types";

export function TopicCard({
  topic,
  eventId,
  alreadySubmitted,
}: {
  topic: TopicDTO;
  eventId: string;
  alreadySubmitted: boolean;
}) {
  const router = useRouter();
  return (
    <div style={{ padding: 24, borderRadius: theme.radius, background: theme.gradients.hero, color: "#fff" }}>
      <p style={{ opacity: 0.9, margin: 0 }}>📸 Current topic</p>
      <h2 style={{ fontSize: 30, fontWeight: 800, margin: "8px 0" }}>{topic.title}</h2>
      {topic.description && <p style={{ opacity: 0.95 }}>{topic.description}</p>}
      <div style={{ margin: "12px 0", background: "rgba(255,255,255,.25)", borderRadius: 16, padding: 12, textAlign: "center" }}>
        <CountdownRing deadline={topic.closeAt} />
        <span style={{ fontSize: 13 }}>left to capture</span>
      </div>
      {alreadySubmitted ? (
        <p style={{ fontWeight: 700 }}>✅ You&apos;ve submitted for this topic!</p>
      ) : (
        <Button onClick={() => router.push(`/event/${eventId}/capture/${topic.id}`)} style={{ background: "#fff", color: "#1A1A2E" }}>
          Take your photo
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 5: Create `src/app/event/[id]/page.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { ensureLogin } from "@/lib/liff";
import { Spinner } from "@/components/ui/Spinner";
import { TopicCard } from "@/components/player/TopicCard";
import { ProgressHeader } from "@/components/player/ProgressHeader";
import { AddBotPrompt } from "@/components/player/AddBotPrompt";
import type { ActiveTopicDTO } from "@/types";

export default function EventHome() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ActiveTopicDTO | null>(null);
  const [notFriend, setNotFriend] = useState(false);
  const [botId, setBotId] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let timer: ReturnType<typeof setInterval>;
    (async () => {
      try {
        const p = await ensureLogin();
        setNotFriend(!p.isBotFriend);
        setBotId(process.env.NEXT_PUBLIC_LINE_BOT_BASIC_ID ?? "");
        const load = async () => {
          const res = await fetch(`/api/events/${id}/active-topic`, { headers: { "x-line-id-token": p.idToken } });
          const json = await res.json();
          if (json.ok) setData(json.data);
          else setError(json.error);
        };
        await load();
        timer = setInterval(load, 15000); // refresh to catch topic open/close
      } catch (e) {
        setError((e as Error).message);
      }
    })();
    return () => clearInterval(timer);
  }, [id]);

  if (error) return <p style={{ padding: 24, color: "#D64545" }}>{error}</p>;
  if (!data) return <Spinner />;

  return (
    <main style={{ padding: 20 }}>
      <ProgressHeader completed={data.completed} total={data.total} />
      {notFriend && <AddBotPrompt botBasicId={botId} />}
      {data.topic ? (
        <TopicCard topic={data.topic} eventId={id} alreadySubmitted={data.alreadySubmitted} />
      ) : (
        <div style={{ padding: 32, textAlign: "center", color: "#888" }}>
          <p style={{ fontSize: 22 }}>No active topic right now ✨</p>
          <p>Keep your notifications on — the next one drops soon!</p>
        </div>
      )}
    </main>
  );
}
```

> Add `NEXT_PUBLIC_LINE_BOT_BASIC_ID` to `.env.example` and `.env.local` (mirror of `LINE_BOT_BASIC_ID`) so the client can build the add-friend link.

- [ ] **Step 6: Verify**

Open `/event/[id]` in LINE. Expected: progress bar shows X/N; if not a bot friend, AddBotPrompt shows; if a topic is open, the topic card with live countdown shows and "Take your photo" routes to capture.

- [ ] **Step 7: Commit**

```bash
git add src/components/ui/CountdownRing.tsx src/components/ui/ProgressBar.tsx src/components/player/TopicCard.tsx src/components/player/ProgressHeader.tsx src/app/event/[id]/page.tsx .env.example
git commit -m "feat: add player home with active topic, countdown, progress"
```

---

## Phase 6 — Cron + Push

### Task 6.1: LINE Messaging push client

**Files:** Create: `src/lib/line.ts`

- [ ] **Step 1: Create `src/lib/line.ts`**

```ts
import { messagingApi } from "@line/bot-sdk";
import { env } from "@/lib/env";

let client: messagingApi.MessagingApiClient | null = null;

function api(): messagingApi.MessagingApiClient {
  if (client) return client;
  client = new messagingApi.MessagingApiClient({ channelAccessToken: env().LINE_MESSAGING_CHANNEL_ACCESS_TOKEN });
  return client;
}

/** Push a text message to one lineUserId. Throws on API error (caller logs). */
export async function pushText(lineUserId: string, text: string): Promise<void> {
  await api().pushMessage({ to: lineUserId, messages: [{ type: "text", text }] });
}

export function topicOpenMessage(title: string, windowMinutes: number, link: string): string {
  return `📸 New topic: ${title} — you've got ${windowMinutes} min!\nOpen the app: ${link}`;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/line.ts
git commit -m "feat: add LINE Messaging push client"
```

---

### Task 6.2: Cron tick route (idempotent open/push/close)

**Files:** Create: `src/app/api/cron/tick/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest } from "next/server";
import { dbConnect } from "@/lib/db";
import { Event, Topic, Player, PushLog } from "@/models";
import { pushText, topicOpenMessage } from "@/lib/line";
import { env } from "@/lib/env";
import { ok, fail } from "@/lib/http";
import { timingSafeEqual } from "crypto";

export const runtime = "nodejs";

function secretOk(provided: string): boolean {
  const expected = env().CRON_SECRET;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!secretOk(req.headers.get("x-cron-secret") ?? "")) return fail("forbidden", 401);

  await dbConnect();
  const now = new Date();

  // 1) Open due topics.
  await Topic.updateMany(
    { status: "scheduled", scheduledAt: { $lte: now } },
    { $set: { status: "open" } }
  );

  // 2) Push for opened topics not yet pushed. Claim pushSentAt FIRST to avoid double-send.
  const toPush = await Topic.find({ status: "open", pushSentAt: null, closeAt: { $gt: now } });
  let pushed = 0;
  for (const topic of toPush) {
    const claimed = await Topic.findOneAndUpdate(
      { _id: topic._id, pushSentAt: null },
      { $set: { pushSentAt: now } },
      { new: true }
    );
    if (!claimed) continue; // another tick claimed it

    const ev = await Event.findById(topic.eventId);
    if (!ev) continue;
    const link = env().APP_BASE_URL.replace(/\/$/, "") + `/event/${ev._id}`;
    const players = await Player.find({ eventId: topic.eventId, isBotFriend: true });
    for (const p of players) {
      try {
        await pushText(p.lineUserId, topicOpenMessage(topic.title, topic.windowMinutes, link));
        await PushLog.create({ eventId: ev._id, topicId: topic._id, type: "topic_open", success: true });
      } catch (e) {
        await PushLog.create({ eventId: ev._id, topicId: topic._id, type: "topic_open", success: false, error: (e as Error).message });
      }
    }
    pushed++;
  }

  // 3) Close expired topics.
  const closed = await Topic.updateMany(
    { status: "open", closeAt: { $lt: now } },
    { $set: { status: "closed" } }
  );

  // 4) Flip events live->ended past endAt (reveal stays manual).
  await Event.updateMany({ status: { $in: ["draft", "live"] }, endAt: { $lt: now } }, { $set: { status: "ended" } });

  return ok({ openedAndPushed: pushed, closed: closed.modifiedCount, at: now.toISOString() });
}
```

- [ ] **Step 2: Create `vercel.json`** (root)

```json
{
  "crons": [{ "path": "/api/cron/tick", "schedule": "* * * * *" }]
}
```

> Vercel Cron does not send a custom header by default. Two options: (a) read `CRON_SECRET` from the `Authorization: Bearer` header Vercel sends when `CRON_SECRET` is set in project env (Vercel's built-in cron auth), or (b) put the secret in the path/query. This plan uses an `x-cron-secret` header for manual testing; for Vercel, also accept `authorization: Bearer <CRON_SECRET>`. Update `secretOk` to check both headers:

```ts
function secretOk(req: NextRequest): boolean {
  const expected = env().CRON_SECRET;
  const header = req.headers.get("x-cron-secret") ?? (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
```
Replace the `secretOk(req.headers.get(...))` call with `secretOk(req)`.

- [ ] **Step 3: Verify idempotency manually**

Create a topic with `scheduledAt` ~1 min in the past via the admin UI. Then:
```bash
curl -s -X POST localhost:3000/api/cron/tick -H "x-cron-secret: <CRON_SECRET>"
curl -s -X POST localhost:3000/api/cron/tick -H "x-cron-secret: <CRON_SECRET>"
```
Expected: first call opens the topic and reports `openedAndPushed: 1`; second call reports `openedAndPushed: 0` (already pushed). Confirm exactly one set of `PushLog` rows per friended player. Wrong secret returns 401.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/cron/tick/route.ts vercel.json
git commit -m "feat: add idempotent cron tick with push and vercel cron config"
```

---

## Phase 7 — Reveal

### Task 7.1: Reveal trigger API + RevealButton

**Files:** Create: `src/app/api/events/[id]/reveal/route.ts`, `src/components/admin/RevealButton.tsx`

- [ ] **Step 1: Create `reveal/route.ts`**

```ts
import { NextRequest } from "next/server";
import { dbConnect } from "@/lib/db";
import { Event } from "@/models";
import { requireAdmin, AuthError } from "@/lib/auth-guards";
import { eventToDTO } from "@/lib/dto";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireAdmin();
    await dbConnect();
    const { id } = await params;
    const ev = await Event.findByIdAndUpdate(id, { $set: { status: "revealed" } }, { new: true });
    if (!ev) return fail("event not found", 404);
    return ok(eventToDTO(ev));
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, e.status);
    return fail((e as Error).message, 400);
  }
}
```

- [ ] **Step 2: Create `src/components/admin/RevealButton.tsx`**

```tsx
"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import type { EventStatus } from "@/types";

export function RevealButton({ eventId, status }: { eventId: string; status: EventStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (status === "revealed") {
    return <p style={{ marginTop: 24, fontWeight: 700, color: "#6BCB77" }}>🎬 Reveal is live.</p>;
  }

  async function trigger() {
    if (!confirm("Reveal all photos to players now? This cannot be undone.")) return;
    setBusy(true);
    const res = await fetch(`/api/events/${eventId}/reveal`, { method: "POST" });
    setBusy(false);
    if ((await res.json()).ok) router.refresh();
  }

  return (
    <div style={{ marginTop: 24 }}>
      <Button onClick={trigger} disabled={busy}>{busy ? "Revealing…" : "🎉 Trigger reveal"}</Button>
    </div>
  );
}
```

- [ ] **Step 3:** If you stubbed `RevealButton` in Task 3.4, remove the stub and ensure the real import is active in `src/app/admin/events/[id]/page.tsx`.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/events/[id]/reveal/route.ts src/components/admin/RevealButton.tsx
git commit -m "feat: add reveal trigger API and admin reveal button"
```

---

### Task 7.2: Reveal-data API (gated)

**Files:** Create: `src/app/api/events/[id]/reveal-data/route.ts`

- [ ] **Step 1: Create the route**

```ts
import { NextRequest } from "next/server";
import { dbConnect } from "@/lib/db";
import { Event, Topic, Submission, Player } from "@/models";
import { ok, fail } from "@/lib/http";
import type { RevealSubmissionDTO } from "@/types";

export const runtime = "nodejs";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await dbConnect();
    const { id } = await params;
    const ev = await Event.findById(id);
    if (!ev) return fail("event not found", 404);

    // GATE: no submission data leaves the server until explicitly revealed.
    if (ev.status !== "revealed") return fail("reveal not started", 403);

    const topics = await Topic.find({ eventId: id }).sort({ order: 1, scheduledAt: 1 });
    const topicTitle = new Map(topics.map((t) => [String(t._id), t.title]));
    const subs = await Submission.find({ eventId: id });
    const players = await Player.find({ eventId: id });
    const nameById = new Map(players.map((p) => [String(p._id), { name: p.displayName, pic: p.pictureUrl }]));

    const items: RevealSubmissionDTO[] = subs.map((s) => {
      const who = nameById.get(String(s.playerId));
      return {
        topicId: String(s.topicId),
        topicTitle: topicTitle.get(String(s.topicId)) ?? "",
        imageUrl: s.imageUrl,
        thumbnailUrl: s.thumbnailUrl,
        displayName: who?.name ?? "Someone",
        pictureUrl: who?.pic || undefined,
      };
    });

    // Order items by topic order for grouped playback.
    const order = new Map(topics.map((t, i) => [String(t._id), i]));
    items.sort((a, b) => (order.get(a.topicId) ?? 0) - (order.get(b.topicId) ?? 0));

    return ok({ eventName: ev.name, items });
  } catch (e) {
    return fail((e as Error).message, 400);
  }
}
```

- [ ] **Step 2: Verify gating**

Before reveal: `curl -s localhost:3000/api/events/<id>/reveal-data` → `{"ok":false,"error":"reveal not started"}` (403). Trigger reveal, then the same curl returns the grouped items.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/events/[id]/reveal-data/route.ts
git commit -m "feat: add gated reveal-data API"
```

---

### Task 7.3: Reveal slideshow page

**Files:** Create: `src/components/reveal/Slideshow.tsx`, `src/app/event/[id]/reveal/page.tsx`

- [ ] **Step 1: Create `src/components/reveal/Slideshow.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { RevealSubmissionDTO } from "@/types";

export function Slideshow({ items }: { items: RevealSubmissionDTO[] }) {
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(true);

  useEffect(() => {
    if (!playing || items.length === 0) return;
    const t = setInterval(() => setI((x) => (x + 1) % items.length), 3500); // music-video pacing
    return () => clearInterval(t);
  }, [playing, items.length]);

  if (items.length === 0) return <p style={{ color: "#fff", padding: 24 }}>No photos to show.</p>;
  const cur = items[i];

  return (
    <div
      onClick={() => setPlaying((p) => !p)}
      style={{ position: "fixed", inset: 0, background: "#0B0B14", display: "grid", placeItems: "center" }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={i}
          initial={{ opacity: 0, scale: 1.05 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.98 }}
          transition={{ duration: 0.6 }}
          style={{ width: "100%", height: "100%", display: "grid", placeItems: "center", padding: 16 }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cur.imageUrl} alt={cur.topicTitle} style={{ maxWidth: "100%", maxHeight: "80vh", borderRadius: 16 }} />
          <div style={{ position: "absolute", bottom: 40, left: 0, right: 0, textAlign: "center", color: "#fff" }}>
            <p style={{ fontSize: 14, opacity: 0.8, margin: 0 }}>{cur.topicTitle}</p>
            <p style={{ fontSize: 22, fontWeight: 800, margin: "4px 0" }}>{cur.displayName}</p>
          </div>
        </motion.div>
      </AnimatePresence>
      <div style={{ position: "absolute", top: 16, right: 16, color: "#fff", fontSize: 13, opacity: 0.7 }}>
        {i + 1}/{items.length} · tap to {playing ? "pause" : "play"}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `src/app/event/[id]/reveal/page.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Slideshow } from "@/components/reveal/Slideshow";
import { Spinner } from "@/components/ui/Spinner";
import type { RevealSubmissionDTO } from "@/types";

export default function RevealPage() {
  const { id } = useParams<{ id: string }>();
  const [items, setItems] = useState<RevealSubmissionDTO[] | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    (async () => {
      const res = await fetch(`/api/events/${id}/reveal-data`);
      if (res.status === 403) { setLocked(true); return; }
      const json = await res.json();
      if (json.ok) setItems(json.data.items);
    })();
  }, [id]);

  if (locked) {
    return (
      <main style={{ padding: 32, textAlign: "center" }}>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>The reveal hasn&apos;t started yet 🎬</h1>
        <p style={{ color: "#888" }}>Hang tight — your host will start it soon!</p>
      </main>
    );
  }
  if (!items) return <Spinner />;
  return <Slideshow items={items} />;
}
```

- [ ] **Step 3: Verify**

Before reveal, `/event/[id]/reveal` shows the "hasn't started" screen. After triggering reveal, it plays a full-screen slideshow grouped by topic with names; tap toggles play/pause.

- [ ] **Step 4: Commit**

```bash
git add src/components/reveal/Slideshow.tsx src/app/event/[id]/reveal/page.tsx
git commit -m "feat: add reveal slideshow page"
```

---

## Phase 8 — Polish, README, Hardening

### Task 8.1: Not-found page + reveal link on player home when revealed

**Files:** Create: `src/app/not-found.tsx`; Modify: `src/app/event/[id]/page.tsx`

- [ ] **Step 1: Create `src/app/not-found.tsx`**

```tsx
export default function NotFound() {
  return (
    <main style={{ padding: 32, textAlign: "center" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800 }}>Lost the trail 🧭</h1>
      <p style={{ color: "#888" }}>This page doesn&apos;t exist.</p>
      <a href="/join" style={{ color: "#FF6B9D", fontWeight: 700 }}>Go to join</a>
    </main>
  );
}
```

- [ ] **Step 2: Add a reveal CTA to the player home.** In `src/app/event/[id]/page.tsx`, the `active-topic` response doesn't include event status. Extend `ActiveTopicDTO` and the API to include `eventStatus`, then show a "Watch the reveal 🎬" button when `eventStatus === "revealed"`.

In `src/types/index.ts`, add to `ActiveTopicDTO`:
```ts
  eventStatus: EventStatus;
```

In `src/app/api/events/[id]/active-topic/route.ts`, change the payload to include it:
```ts
    const payload: ActiveTopicDTO = {
      topic: active ? topicToDTO(active) : null,
      serverNow: now.toISOString(),
      alreadySubmitted,
      completed,
      total,
      eventStatus: ev.status,
    };
```

In `src/app/event/[id]/page.tsx`, render below the topic section:
```tsx
      {data.eventStatus === "revealed" && (
        <a href={`/event/${id}/reveal`} style={{ display: "block", marginTop: 16 }}>
          <button style={{ width: "100%", padding: 16, borderRadius: 20, border: "none", background: "#A06CD5", color: "#fff", fontWeight: 800, fontSize: 18 }}>
            🎬 Watch the reveal
          </button>
        </a>
      )}
```

- [ ] **Step 3: Verify**

`npx tsc --noEmit` passes. After reveal, the player home shows the "Watch the reveal" button.

- [ ] **Step 4: Commit**

```bash
git add src/app/not-found.tsx src/types/index.ts src/app/api/events/[id]/active-topic/route.ts src/app/event/[id]/page.tsx
git commit -m "feat: add not-found page and reveal CTA on player home"
```

---

### Task 8.2: Project README with setup + env vars

**Files:** Modify: `README.md` (append a setup section; keep the existing brief above it)

- [ ] **Step 1: Append a setup guide** to `README.md` covering: required env vars (table from `.env.example`), LINE console setup (one provider holding the LIFF app, LINE Login channel, and Messaging API OA; LIFF endpoint = `APP_BASE_URL`; admin OAuth callback = `APP_BASE_URL/api/admin/auth/callback`; bot basic id), DigitalOcean Spaces bucket + keys, MongoDB Atlas URI, local dev (`cp .env.example .env.local`, `npm run dev`), and Vercel deploy (set all env vars; Vercel Cron auto-reads `vercel.json`; set `CRON_SECRET`). Include the manual verification checklist from the spec.

```markdown
## Setup & Deployment

### Environment variables
| Var | Purpose |
| --- | --- |
| MONGODB_URI | MongoDB Atlas connection string |
| APP_BASE_URL | Public base URL (LIFF endpoint + OAuth callback base) |
| NEXT_PUBLIC_LIFF_ID | LIFF app id (player auth) |
| NEXT_PUBLIC_LINE_BOT_BASIC_ID | Bot basic id for add-friend link |
| LINE_LOGIN_CHANNEL_ID / _SECRET | LINE Login channel (admin OAuth + LIFF id_token verify) |
| ADMIN_LINE_IDS | Comma-separated lineUserId allowlist for admins |
| ADMIN_SESSION_SECRET | >=32 char secret for iron-session |
| LINE_MESSAGING_CHANNEL_ACCESS_TOKEN / _SECRET | Messaging API push channel |
| LINE_BOT_BASIC_ID | Bot basic id (server) |
| SPACES_ENDPOINT / REGION / BUCKET / KEY / SECRET / CDN_BASE_URL | DigitalOcean Spaces |
| CRON_SECRET | Shared secret for /api/cron/tick |

### LINE console
1. Create one Provider. Under it, create a LINE Login channel and a Messaging API channel (Official Account).
2. Create a LIFF app on the LINE Login channel; set its endpoint URL to `APP_BASE_URL`. Copy the LIFF ID → `NEXT_PUBLIC_LIFF_ID`.
3. Add `APP_BASE_URL/api/admin/auth/callback` to the LINE Login channel's callback URLs.
4. Issue a long-lived channel access token for the Messaging API channel → `LINE_MESSAGING_CHANNEL_ACCESS_TOKEN`.
5. Link the OA to the LIFF/Login provider so `getFriendship()` and pushes work.

### Local dev
- `cp .env.example .env.local` and fill values.
- `npm run dev`, then `curl localhost:3000/api/health`.

### Vercel
- Set all env vars in the project. `vercel.json` registers the 1/min cron automatically.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add setup and deployment guide"
```

---

### Task 8.3: Final hardening pass

**Files:** review across the repo

- [ ] **Step 1: Confirm runtime + DB on every API route.** Verify each file under `src/app/api/**/route.ts` has `export const runtime = "nodejs"` and calls `await dbConnect()` before DB access.

- [ ] **Step 2: Confirm reveal gating.** Re-read `reveal-data/route.ts` and `active-topic/route.ts`: no other-player submission data is returned before `status === "revealed"`. (active-topic returns only the requesting player's own submitted boolean.)

- [ ] **Step 3: Confirm cron idempotency guards** (`pushSentAt` claim-before-send; close by `closeAt`).

- [ ] **Step 3b: Normalize API error handling across ALL routes** (deferred from Phase 3 review). The routes use `catch (e) { ...; return fail((e as Error).message, 400); }`, which maps infra failures (Mongo/network) to HTTP 400 and leaks raw error messages. Apply a consistent pattern in every `src/app/api/**/route.ts` catch block: keep `AuthError → fail(e.message, e.status)`; map `ZodError` (and the `z.ZodError` from `.parse`) to `fail("invalid request", 400)`; map everything else to a generic `fail("internal error", 500)` while `console.error`-ing the real error server-side. Do not echo raw exception text to clients.

- [ ] **Step 4: Full build.**

Run: `npm run build`
Expected: build succeeds with no type errors.

- [ ] **Step 5: End-to-end dry run** (manual, with real LINE + Spaces + Atlas):
  1. Admin logs in (allowlisted) → creates an event → schedules a topic ~2 min ahead.
  2. Player opens LIFF → joins by code → adds bot if prompted.
  3. Cron opens the topic at its time and pushes; re-running the cron does not double-push.
  4. Player captures + submits within the window; confetti; submission stored in Spaces + Mongo. After `closeAt`, submission is rejected.
  5. Admin triggers reveal → player sees "Watch the reveal" → slideshow plays grouped by topic.
  6. Timezone: the topic opened at the correct Asia/Bangkok local time.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "chore: final hardening pass"
```

---

## Self-Review Notes (spec coverage)

- **Player onboarding (LIFF):** Tasks 4.1–4.3 (init, login, getProfile, join code/link, friend detection + AddBotPrompt). ✓
- **Scheduled prompt → submission:** Tasks 5.3–5.6 + 6.x (active-topic, countdown, live capture, server window, one-per-topic, retake). ✓
- **Quiet collection:** active-topic returns only the player's own submitted flag; no feed. ✓
- **Reveal slideshow:** Tasks 7.1–7.3 (gating, grouped-by-topic playback, names). ✓
- **Data models:** Task 1.2 (all five, indexes, `closeAt`, `mediaType`, `settings`). ✓
- **Pages/routes & API routes:** all README routes mapped to tasks. ✓
- **Notifications/scheduling:** Task 6.x (push, idempotent tick, server-authoritative windows, secret). ✓
- **Constraints:** live-capture (best-effort) 5.5/5.6; server time/dedup 5.3/5.4; friend detection 4.1/5.7/6.2; tz 1.3; reveal lock 7.2. ✓
- **Deliverables & env README:** Task 8.2. ✓
- **Out of scope (v1):** reactions/voting/leaderboards/AI/video deliberately omitted; schema (`mediaType`, `settings`) leaves room. ✓
```
