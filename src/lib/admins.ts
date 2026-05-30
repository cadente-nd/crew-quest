import { adminLineIds } from "@/lib/env";
import { dbConnect } from "@/lib/db";
import { Admin } from "@/models";

/** True if the LINE userId is an admin via the env allowlist OR the Admin collection. */
export async function isAuthorizedAdmin(lineUserId: string): Promise<boolean> {
  if (adminLineIds().includes(lineUserId)) return true;
  await dbConnect();
  return !!(await Admin.exists({ lineUserId }));
}

/** True if any admin is configured at all (env allowlist non-empty OR any Admin doc). */
export async function hasAnyAdmin(): Promise<boolean> {
  if (adminLineIds().length > 0) return true;
  await dbConnect();
  return !!(await Admin.exists({}));
}

/** Promote a LINE user to admin in the DB. Idempotent — safe to call repeatedly. */
export async function bootstrapFirstAdmin(lineUserId: string, displayName: string): Promise<void> {
  await dbConnect();
  await Admin.updateOne(
    { lineUserId },
    { $setOnInsert: { lineUserId, displayName } },
    { upsert: true },
  );
}
