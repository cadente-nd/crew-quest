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
