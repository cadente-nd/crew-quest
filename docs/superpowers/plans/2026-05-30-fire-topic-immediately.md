# Fire a Topic Immediately — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an admin-only "🔥 Fire now" action that opens a scheduled topic and pushes to players immediately, bypassing the cron schedule.

**Architecture:** Extract the cron's per-topic push fan-out into a shared `pushTopicOpen()` helper. A new `POST /api/events/[id]/topics/[topicId]/fire` route atomically opens the topic (resetting its window to start now), auto-closes any other open topic in the event, then calls the helper. A "Fire now" button in the admin topic list triggers it.

**Tech Stack:** Next.js App Router (route handlers), Mongoose, LINE Messaging API push, React client component.

> **Testing note:** This codebase has no test runner (only `eslint`). The automated gate for each task is `npx tsc --noEmit` (typecheck) + `npm run lint`, with manual end-to-end verification (requires live LINE + MongoDB) at the end. Do not introduce a test framework — it's out of scope for this feature.

---

### Task 1: Extract `pushTopicOpen()` helper and refactor cron to use it

This is a pure refactor — cron behavior must stay identical. It creates the shared helper the fire endpoint will reuse.

**Files:**
- Create: `src/lib/topics.ts`
- Modify: `src/app/api/cron/tick/route.ts`

- [ ] **Step 1: Create the shared helper**

Create `src/lib/topics.ts` with the exact push/log logic currently inlined in cron:

```ts
import { Event, Player, PushLog, type TopicDoc } from "@/models";
import { pushText, topicOpenMessage } from "@/lib/line";
import { env } from "@/lib/env";

/**
 * Send the "topic open" push to every bot-friend player in the topic's event,
 * writing a PushLog row per recipient. Shared by the cron tick and the manual
 * "fire now" action. The caller is responsible for opening the topic (setting
 * status/pushSentAt) and for ensuring a DB connection is established.
 */
export async function pushTopicOpen(topic: TopicDoc): Promise<void> {
  const ev = await Event.findById(topic.eventId);
  if (!ev) return;
  const link = env().APP_BASE_URL.replace(/\/$/, "") + `/event/${ev._id}`;
  const players = await Player.find({ eventId: topic.eventId, isBotFriend: true });
  for (const p of players) {
    try {
      await pushText(p.lineUserId, topicOpenMessage(topic.title, topic.windowMinutes, link));
      await PushLog.create({ eventId: ev._id, topicId: topic._id, lineUserId: p.lineUserId, type: "topic_open", success: true });
    } catch (e) {
      await PushLog.create({ eventId: ev._id, topicId: topic._id, lineUserId: p.lineUserId, type: "topic_open", success: false, error: (e as Error).message });
    }
  }
}
```

- [ ] **Step 2: Update cron imports**

In `src/app/api/cron/tick/route.ts`, replace the two import lines:

```ts
import { Event, Topic, Player, PushLog } from "@/models";
import { pushText, topicOpenMessage } from "@/lib/line";
```

with (cron no longer references `Player`, `PushLog`, `pushText`, or `topicOpenMessage` directly; it keeps `Event` for step 4 and `Topic` throughout):

```ts
import { Event, Topic } from "@/models";
import { pushTopicOpen } from "@/lib/topics";
```

- [ ] **Step 3: Replace the cron push loop body**

In the same file, replace the push section (the `for (const topic of toPush)` loop, currently the block that fetches `ev`, builds `link`, loads `players`, and loops `pushText`/`PushLog.create`) so the loop becomes:

```ts
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
      await pushTopicOpen(claimed);
      pushed++;
    }
```

Leave sections 1 (open due), 3 (close expired), and 4 (events live→ended) untouched.

- [ ] **Step 4: Verify typecheck + lint pass**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output / no errors (in particular, no "unused variable" or "cannot find name" errors — confirms the removed imports are no longer referenced and `pushTopicOpen` resolves).

- [ ] **Step 5: Commit**

```bash
git add src/lib/topics.ts src/app/api/cron/tick/route.ts
git commit -m "refactor: extract pushTopicOpen helper shared by cron"
```

---

### Task 2: Add the fire endpoint

**Files:**
- Create: `src/app/api/events/[id]/topics/[topicId]/fire/route.ts`

- [ ] **Step 1: Create the route**

Create `src/app/api/events/[id]/topics/[topicId]/fire/route.ts`. It mirrors the `/reveal` route pattern (`src/app/api/events/[id]/reveal/route.ts`) and uses the helper from Task 1. The open is a single atomic aggregation-pipeline update gated on `status: "scheduled"`, which both resets the window from `now` (reading the topic's own `windowMinutes` via `$windowMinutes`) and prevents a double-click / racing cron tick from firing twice:

```ts
import { NextRequest } from "next/server";
import { dbConnect } from "@/lib/db";
import { Topic } from "@/models";
import { requireAdmin, AuthError } from "@/lib/auth-guards";
import { pushTopicOpen } from "@/lib/topics";
import { topicToDTO } from "@/lib/dto";
import { ok, fail } from "@/lib/http";

export const runtime = "nodejs";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; topicId: string }> },
) {
  try {
    await requireAdmin();
    await dbConnect();
    const { id: eventId, topicId } = await params;
    const now = new Date();

    // Open the topic and reset its window to start now. Atomic + gated on
    // status:"scheduled" so a double-click or racing cron tick can't fire twice.
    // closeAt = now + windowMinutes (read from the topic via the pipeline).
    const topic = await Topic.findOneAndUpdate(
      { _id: topicId, eventId, status: "scheduled" },
      [
        {
          $set: {
            status: "open",
            scheduledAt: now,
            pushSentAt: now,
            closeAt: { $add: [now, { $multiply: ["$windowMinutes", 60000] }] },
          },
        },
      ],
      { new: true },
    );
    if (!topic) return fail("topic not found or not scheduled", 404);

    // Auto-close any other currently-open topic so the fired one is what players see.
    await Topic.updateMany(
      { eventId, status: "open", _id: { $ne: topic._id } },
      { $set: { status: "closed" } },
    );

    await pushTopicOpen(topic);
    return ok(topicToDTO(topic));
  } catch (e) {
    if (e instanceof AuthError) return fail(e.message, e.status);
    console.error("topic fire POST", e);
    return fail("internal server error", 500);
  }
}
```

- [ ] **Step 2: Verify typecheck + lint pass**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output / no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/api/events/[id]/topics/[topicId]/fire/route.ts"
git commit -m "feat: add fire-topic-immediately endpoint"
```

---

### Task 3: Add the "Fire now" button to the admin topic list

**Files:**
- Modify: `src/components/admin/TopicScheduler.tsx`

- [ ] **Step 1: Add per-row firing state**

In `src/components/admin/TopicScheduler.tsx`, add a state hook alongside the existing `busy`/`err` hooks (so per-row firing is independent of the add-topic form's `busy`):

```tsx
  const [firingId, setFiringId] = useState<string | null>(null);
```

- [ ] **Step 2: Add the `fireNow` handler**

Add this function inside the component, after the existing `add` function:

```tsx
  async function fireNow(topicId: string) {
    if (!confirm("Fire this topic now? Players will be notified immediately.")) return;
    setFiringId(topicId);
    setErr("");
    try {
      const res = await fetch(`/api/events/${eventId}/topics/${topicId}/fire`, { method: "POST" });
      const json = await res.json();
      if (json.ok) router.refresh();
      else setErr(json.error || "Failed to fire topic");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setFiringId(null);
    }
  }
```

- [ ] **Step 3: Render the button for scheduled topics**

Replace the topics list `.map(...)` block with this version, which lays each row out with the button on the right and shows it only for `scheduled` topics:

```tsx
        {topics.map((t) => (
          <div
            key={t.id}
            style={{ padding: 12, borderRadius: 12, background: "#fff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}
          >
            <span>
              <strong>{t.title}</strong> — {new Date(t.scheduledAt).toLocaleString()} · {t.windowMinutes}m · {t.status}
            </span>
            {t.status === "scheduled" && (
              <Button onClick={() => fireNow(t.id)} disabled={firingId === t.id}>
                {firingId === t.id ? "Firing…" : "🔥 Fire now"}
              </Button>
            )}
          </div>
        ))}
```

(`Button` is already imported and already supports `onClick`/`disabled` — see its use in `src/components/admin/RevealButton.tsx`.)

- [ ] **Step 4: Verify typecheck + lint pass**

Run: `npx tsc --noEmit && npm run lint`
Expected: no output / no errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/TopicScheduler.tsx
git commit -m "feat: add Fire now button to admin topic list"
```

---

## Manual end-to-end verification (requires live LINE + MongoDB)

Run after all three tasks. There is no automated harness for these; perform them against a real deployment/dev setup:

1. **Fire opens + pushes.** Schedule a topic for a future time. On the admin event page, click "🔥 Fire now" → confirm dialog → the row's status becomes `open`; `scheduledAt`/`closeAt` are now / now+windowMinutes; bot-friend players receive the LINE push; `PushLog` rows exist for the topic.
2. **Player can submit immediately.** As a player, the fired topic is the active topic and a submission succeeds; after `closeAt`, a submission is rejected with 403.
3. **Auto-close overlap.** With one topic already `open`, fire a second scheduled topic → the first flips to `closed`; the player "active topic" becomes the newly fired one.
4. **No cron double-push.** Trigger `POST /api/cron/tick` with the cron secret after firing → response shows the fired topic was not re-pushed (its `pushSentAt` was already set); no duplicate `PushLog` rows.
5. **Idempotent fire.** Click "Fire now" twice quickly (or re-POST the fire endpoint) → the second call returns 404 "topic not found or not scheduled"; no second push.
6. **Auth.** `POST` the fire endpoint while logged out → 401.

## Self-review notes
- **Spec coverage:** window reset (Task 2 pipeline `$set`), auto-close overlap (Task 2 `updateMany`), push parity via shared helper (Task 1), `pushSentAt` idempotency vs cron (Task 2 `$set` + Task 1 unchanged claim), scheduled-only + 404 (Task 2 gate), UI button for scheduled topics (Task 3) — all covered.
- **Type consistency:** helper named `pushTopicOpen` in Tasks 1 & 2; `firingId` state used consistently in Task 3; route uses existing `topicToDTO`, `ok`/`fail`, `requireAdmin`/`AuthError`.
