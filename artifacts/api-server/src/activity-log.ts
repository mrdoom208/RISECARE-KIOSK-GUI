import { run } from "@workspace/db";
import { logger } from "./logger";

// Records an entry into the activity log. Failures are non-fatal so auditing
// never breaks a request.
export async function logActivity(accountId: number | null, action: string, details: string) {
  try {
    await run("INSERT INTO activity_log (account_id, action, details) VALUES (?, ?, ?)", [
      accountId,
      action,
      details,
    ]);
  } catch (e) {
    logger.error("Activity Log", "Could not record an activity log entry", e);
  }
}
