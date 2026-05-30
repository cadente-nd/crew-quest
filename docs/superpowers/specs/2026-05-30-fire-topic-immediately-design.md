# Fire a topic immediately — design

## Context

Topics are opened on a schedule: an admin sets each topic's `scheduledAt`, and the
once-a-minute cron (`src/app/api/cron/tick/route.ts`) flips it `scheduled → open`, stamps
`pushSentAt`, and pushes a LINE message to every bot-friend player. There is currently no way for
an admin to open a topic on demand — they must wait for the clock. This adds an admin-triggered
**"Fire now"** action that opens a scheduled topic and pushes immediately, bypassing the cron
schedule.

## Behavior

A "🔥 Fire now" button appears next to each topic whose `status === "scheduled"` on the admin
event detail page. Clicking it (after a confirmation dialog) immediately:

1. **Opens the topic, resetting its window to start now** — atomically set, gated on the topic
   still being `scheduled`:
   - `scheduledAt = now`
   - `closeAt = now + windowMinutes` (full window from fire time)
   - `status = "open"`
   - `pushSentAt = now`
2. **Auto-closes any other currently-open topic in the same event** (`status: open → closed`), so
   the freshly-fired topic is unambiguously the one players see (the player "active topic" query
   returns the earliest still-open topic, so a lingering open topic would otherwise mask this one).
3. **Pushes to players** — send `topicOpenMessage(title, windowMinutes, link)` to every
   `isBotFriend` player in the event and write a `PushLog` row per recipient — identical to what
   cron does.

Because `pushSentAt` is stamped during step 1, the next cron tick treats the topic as already
pushed and will not re-send.

### Window semantics
Firing resets the window: `scheduledAt = now`, `closeAt = now + windowMinutes`. The submission
endpoint enforces `status === "open" && scheduledAt <= now && closeAt > now`, so resetting
`scheduledAt` to now is required for players to be able to submit, and resetting `closeAt` gives
the full intended duration regardless of the topic's original schedule.

### Concurrency / idempotency
- The open step uses an atomic `findOneAndUpdate({ _id, eventId, status: "scheduled" }, …)`. A
  double-click, or a cron tick racing the fire action, finds the topic no longer `scheduled` on
  the second attempt and is a no-op (the route returns 404 "not found or not scheduled").
- `pushSentAt = now` is set in the same update, so cron's push claim (`pushSentAt: null`) skips it.

## Backend

### Shared helper — `src/lib/topics.ts` (new)
Extract the cron's per-topic "fan-out push + log" block into a reusable function so cron and the
fire endpoint share one implementation:

```ts
// Sends topic_open push to all bot-friend players in the event and logs each send.
export async function pushTopicOpen(topic: TopicDoc): Promise<void>
```

It loads the event (for the link) and the `isBotFriend` players, then loops `pushText` +
`PushLog.create` with the same success/error handling as cron today. `src/app/api/cron/tick/route.ts`
is refactored to call this helper for each claimed topic (behavior unchanged).

### New route — `POST /api/events/[id]/topics/[topicId]/fire`
File: `src/app/api/events/[id]/topics/[topicId]/fire/route.ts`. Mirrors the `/reveal` route
pattern:

```ts
requireAdmin();
dbConnect();
const now = new Date();
const topic = await Topic.findOneAndUpdate(
  { _id: topicId, eventId, status: "scheduled" },
  { $set: { status: "open", scheduledAt: now, closeAt: <now + windowMinutes>, pushSentAt: now } },
  { new: true },
);
if (!topic) return fail("topic not found or not scheduled", 404);
// auto-close other open topics in this event
await Topic.updateMany({ eventId, status: "open", _id: { $ne: topic._id } }, { $set: { status: "closed" } });
await pushTopicOpen(topic);
return ok(topicToDTO(topic));
```

`windowMinutes` is read from the topic; `closeAt = now + topic.windowMinutes * 60_000`. Auth errors
map to their status via the existing `AuthError` handling; other errors → 500. Uses existing
`ok`/`fail` (`src/lib/http.ts`) and `topicToDTO` (`src/lib/dto.ts`).

## Frontend

In `src/components/admin/TopicScheduler.tsx`, add a "🔥 Fire now" button rendered only for topics
with `status === "scheduled"`. Reuse the `RevealButton` interaction pattern: local `busy`/`err`
state, `confirm("Fire this topic now? Players will be notified immediately.")`, `fetch` the fire
endpoint with `POST`, then `router.refresh()` on success or show an inline error. (TopicScheduler
is already a client component that does `fetch` + refresh for adding topics.)

## Out of scope (non-goals)
- Re-firing or re-pushing `closed` topics — fire applies only to `scheduled` topics.
- Event-status gating — not checked, matching current cron behavior.
- Any scheduling, timezone, or window-default changes.
- A separate "close topic now" admin control (only the implicit auto-close of overlaps is included).

## Verification (end-to-end)
1. `npx tsc --noEmit` and `npm run lint` clean.
2. With a live LINE/Mongo setup: schedule a topic for the future. Click "🔥 Fire now" → topic
   flips to `open`, `scheduledAt`/`closeAt` reset to now / now+window, players receive the push,
   `PushLog` rows written.
3. A player can submit immediately (window check passes); after `closeAt`, submission is rejected.
4. Fire a second topic while the first is still open → the first flips to `closed`, the player
   "active topic" becomes the newly fired one.
5. Re-run cron tick → no duplicate push for the fired topic (`pushSentAt` already set).
6. Click "Fire now" twice quickly → second call returns 404, no double push.
