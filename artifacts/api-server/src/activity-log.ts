import { run } from "@workspace/db";

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
    console.error("Failed to log activity:", e);
  }
}
