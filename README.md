# Build Prompt — Team Outing Photo Game (LIFF App)

> Paste this whole document into your AI coding tool as the project brief.

## 1. One-liner
Build a **LINE LIFF app** for team outings: a BeReal-style photo game where an admin schedules photo "topics" in advance, players get a **LINE push notification** at each scheduled time, must **capture a live photo within a short window**, and all photos stay **hidden until the end of the event**, when the app plays back a celebratory **reveal slideshow**. The product is **reusable across many future events**.

## 2. Tech stack (required)
- **Frontend:** Next.js (App Router, TypeScript, React).
- **LINE integration:** LIFF SDK (`@line/liff`) for auth + in-app context; **LINE Messaging API** for scheduled push notifications.
- **Database:** MongoDB with Mongoose.
- **Image storage:** external object storage (Cloudinary or S3-compatible) — store only the URL/metadata in MongoDB. Do **not** put image binaries in Mongo.
- **Scheduling:** a cron mechanism (Vercel Cron, or a small Node worker using `node-cron`) that fires per scheduled topic to (a) open the submission window and (b) send push notifications.
- **Deploy target:** assume Vercel + MongoDB Atlas. All times stored in UTC; default display timezone **Asia/Bangkok (UTC+7)**, configurable per event.

## 3. Roles
- **Player** — joins an event, receives prompts, submits live photos, watches the final reveal.
- **Admin** — creates/manages events, defines topics + schedule, monitors submissions, triggers/locks the reveal. Admin can be a simple email/password login or a LINE-ID allowlist; keep it separate from the player LIFF flow.

## 4. Core flows

### 4.1 Player onboarding (LIFF)
1. App opens inside LINE → `liff.init()`.
2. If not logged in → `liff.login()`; then `liff.getProfile()` to get `userId`, `displayName`, `pictureUrl`.
3. Player joins an event via an **event join code or join link** (LIFF deep link with `?event=<id>`).
4. **Important:** to receive push notifications, the player must have added the Official Account (Messaging API channel) as a friend. Detect friendship status and show a friendly "Add our LINE bot to get photo alerts" step if missing.

### 4.2 Scheduled prompt → submission
1. At each topic's scheduled time, the scheduler sets the topic to **OPEN** and sends a LINE push message ("📸 New topic: *<topic title>* — you've got 30 min!") with a link back into the LIFF app.
2. Player opens app → sees the active topic with a **countdown timer**.
3. **Camera only — live capture.** No gallery uploads, no pre-existing photos. Use live capture (`getUserMedia` preview + capture, or `<input type="file" accept="image/*" capture="environment">` as fallback). Reject anything not freshly captured.
4. One submission per player per topic (allow a single retake before the window closes — configurable).
5. When the window expires, the topic auto-closes; late submissions are blocked.

### 4.3 Quiet collection (no live feed)
- During the event, players **cannot see** anyone's submissions (including their own gallery is optional/minimal). The payoff is the surprise reveal — keep the in-event UI focused on "what's the current topic + did I submit."
- Show only lightweight progress (e.g. "You've completed 4 / 10 topics").

### 4.4 End-of-event reveal slideshow
- When the event ends (admin triggers, or auto at event end time), unlock the **Reveal** screen.
- Auto-generated, full-screen, **Setlog-style slideshow**: group photos by topic, animate transitions, show topic title + submitter name/avatar, ideally with music-video pacing.
- Make it shareable/loopable so the team can watch together on a big screen.

## 5. Data models (MongoDB / Mongoose)

```
Event
  _id, name, joinCode, timezone (default "Asia/Bangkok"),
  startAt, endAt, status: "draft" | "live" | "ended" | "revealed",
  adminIds: [string], createdAt

Topic
  _id, eventId (ref Event), title, description?, scheduledAt (UTC),
  windowMinutes (e.g. 30), status: "scheduled" | "open" | "closed",
  pushSentAt?, order

Player
  _id, eventId, lineUserId, displayName, pictureUrl,
  isBotFriend: boolean, joinedAt

Submission
  _id, eventId, topicId, playerId, lineUserId,
  imageUrl, thumbnailUrl, capturedAt, createdAt
  // unique index on (topicId, playerId)

PushLog (optional)
  _id, eventId, topicId, type, sentAt, success, error?
```

## 6. Pages / routes (App Router)
- `/` — LIFF entry: init, auth, route to active event or join screen.
- `/join` — enter/confirm join code, add-bot prompt.
- `/event/[id]` — player home: current/active topic, countdown, submit button, progress.
- `/event/[id]/capture/[topicId]` — live camera capture + confirm.
- `/event/[id]/reveal` — the slideshow (gated until status = "revealed").
- `/admin` — admin login.
- `/admin/events` — list / create / edit events.
- `/admin/events/[id]` — manage topics + schedule, view submission counts, trigger reveal.

## 7. API routes
- `POST /api/events` (admin) — create event.
- `POST /api/events/[id]/topics` (admin) — add/edit topics + schedule.
- `POST /api/events/[id]/join` (player) — register player to event.
- `GET  /api/events/[id]/active-topic` (player) — current open topic + remaining time.
- `POST /api/submissions` (player) — upload captured photo; enforce window + one-per-topic server-side (never trust the client clock).
- `POST /api/cron/tick` (scheduler) — find topics whose `scheduledAt <= now`, open them, send push, close expired ones. Secure with a secret header.
- `POST /api/events/[id]/reveal` (admin) — set status to "revealed".
- `GET  /api/events/[id]/reveal-data` (player) — all submissions grouped by topic (only if revealed).

## 8. Notifications & scheduling details
- Use **LINE Messaging API push** (`/v2/bot/message/push`) keyed on `lineUserId`. Requires the player to be a friend of the channel — handle the not-a-friend case gracefully.
- Scheduler runs every minute; idempotent (use `pushSentAt` / status guards so a topic is never opened or pushed twice).
- Enforce the submission window **on the server** using stored UTC times, not the device clock.

## 9. Design / theme (Setlog-inspired)
Setlog is a viral real-time co-vlog app (Korea/Hong Kong) known for live-only capture and a clean, fresh, youthful aesthetic with playful color. Match that energy:
- **Vibe:** bright, fun, energetic, mobile-first, big tap targets, generous rounded corners, bold playful type.
- **Color:** a colorful multi-accent palette (think rainbow/gradient accents on a clean light base), high contrast, candy-bright highlights — but keep layouts clean and uncluttered.
- **Motion:** snappy micro-interactions, a satisfying capture animation, confetti/celebration on submit, and a music-video-paced reveal.
- **Tone:** social, low-pressure, "capture the moment now."
- Mobile-first only (it runs inside LINE). No desktop layout needed for players; admin panel can be responsive.

## 10. Constraints & gotchas to handle
- Live-capture only — block gallery/pre-existing images (validate `capturedAt` ≈ now, server-side).
- Server-authoritative time windows and de-duplication.
- Friend-status detection for push delivery.
- Timezone correctness (store UTC, display Asia/Bangkok by default).
- Reveal data must stay locked until the event is explicitly revealed.

## 11. Out of scope (v1) — note for later
Reactions/voting, multi-team-within-one-event leaderboards, AI-generated topics, video capture. Build the schema so these can be added later without migration pain.

## 12. Deliverables
1. Working Next.js + MongoDB project with the routes/models above.
2. LIFF auth + live-capture submission flow.
3. Admin panel for events/topics/schedule + reveal trigger.
4. Cron endpoint + push notification integration.
5. The reveal slideshow.
6. `README` covering required env vars: `LIFF_ID`, LINE Login channel, LINE Messaging API channel access token, `MONGODB_URI`, image-storage keys, and `CRON_SECRET`
