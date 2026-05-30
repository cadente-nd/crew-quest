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
