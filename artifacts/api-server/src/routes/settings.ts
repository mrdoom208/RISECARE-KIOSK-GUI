import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { run, query, saveDb, dbPath, workspaceRoot } from "@workspace/db";
import { logger } from "../logger";
import { requireAuth, requireReauth, requireSuperadmin, REAUTH_TTL_MS } from "../auth";
import { logActivity } from "../activity-log";
import { logSystem } from "../system-log";
import { SyncError, getPortalBaseUrl, syncPending } from "../device";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";
import { promisify } from "util";

// Kiosk settings and admin authentication: login/logout/re-authenticate,
// idle timeout, network toggle, portal connectivity, and database
// export/delete. Account management lives in accounts.ts, power commands in
// power.ts, and updates in update.ts.

const execFileAsync = promisify(execFile);

function getWifiCommandError(error: any): string {
  const stdout = typeof error?.stdout === "string" ? error.stdout.trim() : "";
  if (stdout) {
    try {
      const parsed = JSON.parse(stdout);
      if (typeof parsed?.error === "string") return parsed.error;
    } catch {
      // Fall through to stderr/message for non-JSON command output.
    }
  }
  return String(error?.stderr || error?.message || "Failed to update Wi-Fi radio").trim();
}

function isWifiPermissionError(message: string): boolean {
  const lower = message.toLowerCase();
  return ["permission", "not authorized", "not authorised", "access denied", "password is required", "sudo"].some(
    (token) => lower.includes(token),
  );
}

function isHashed(password: string): boolean {
  return typeof password === "string" && /^\$2[aby]\$/.test(password);
}

const router: IRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res, _next, options) => {
    res.status(429).json({ error: "rate_limited", message: options.message });
  },
});

// Login with username + password. Establishes a server-side session (HttpOnly cookie).
router.post("/login", loginLimiter, async (req, res) => {
  try {
    const { username, password, context } = req.body ?? {};
    if (typeof username !== "string" || typeof password !== "string" || !username.trim() || !password) {
      res.status(400).json({ success: false, error: "Username and password are required" });
      return;
    }

    const accounts = await query("SELECT * FROM accounts WHERE username = ?", [username.trim()]);
    const account = accounts && accounts.length > 0 ? accounts[0] : null;

    let valid = false;
    if (account) {
      if (isHashed(account.password)) {
        valid = await bcrypt.compare(password, account.password);
      } else {
        valid = account.password === password;
        if (valid) {
          await run("UPDATE accounts SET password = ? WHERE id = ?", [
            await bcrypt.hash(password, 10),
            account.id,
          ]);
        }
      }
    }

    if (!valid) {
      res.status(401).json({ success: false, error: "Invalid username or password" });
      return;
    }

    // Prevent session fixation: discard any pre-existing session before login.
    req.session.regenerate((err) => {
      if (err) {
        res.status(500).json({ error: "Failed to create session" });
        return;
      }
      req.session.userId = account.id;
      delete req.session.reauthUntil;

      const action = context === "history" ? "History Accessed" : "Settings Accessed";
      const details =
        context === "history" ? "User opened session history" : "User opened settings menu";
      void logActivity(account.id, action, details);

      res.json({ success: true, account: { id: account.id, username: account.username, role: account.role } });
    });
  } catch (e) {
    res.status(500).json({ error: "Failed to login" });
  }
});

// Logout: destroy the server-side session
router.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      res.status(500).json({ error: "Failed to logout" });
      return;
    }
    res.clearCookie("connect.sid");
    res.json({ success: true });
  });
});

// Re-authenticate: verifies the password again and grants a short-lived elevated state
// required for destructive operations.
router.post("/reauthenticate", requireAuth, loginLimiter, async (req, res) => {
  try {
    const { password } = req.body ?? {};
    if (typeof password !== "string" || !password) {
      res.status(400).json({ error: "Password is required" });
      return;
    }

    let valid = false;
    if (req.user) {
      if (isHashed(req.user.password)) {
        valid = await bcrypt.compare(password, req.user.password);
      } else {
        valid = req.user.password === password;
      }
    }

    if (!valid) {
      res.status(401).json({ error: "reauth_failed", message: "Invalid password" });
      return;
    }

    req.session.reauthUntil = Date.now() + REAUTH_TTL_MS;
    res.json({ success: true, reauthUntil: req.session.reauthUntil });
  } catch (e) {
    res.status(500).json({ error: "Failed to verify password" });
  }
});

// Export database (superadmin, requires recent re-auth)
router.get("/export", requireAuth, requireSuperadmin, requireReauth, async (req, res) => {
  try {
    // Writes are persisted on a 30s interval; flush first so the downloaded
    // backup always contains every completed write.
    saveDb();
    if (!fs.existsSync(dbPath)) {
      res.status(404).json({ error: "Database not found" });
      return;
    }

    await logActivity(
      req.user?.id ?? null,
      "Database Exported",
      `User ${req.user?.username ?? "Unknown"} exported the database`,
    );
    void logSystem("INFO", "System", "Database exported", {
      by: req.user?.username ?? "Unknown",
    });

    res.download(dbPath, `risecare-backup-${Date.now()}.db`);
  } catch (e) {
    res.status(500).json({ error: "Failed to export database" });
  }
});

// Delete all data (superadmin, requires recent re-auth)
router.post("/delete", requireAuth, requireSuperadmin, requireReauth, async (req, res) => {
  try {
    await run("DELETE FROM vital_readings");
    await run("DELETE FROM sessions");
    // Flush immediately so a power cut right after cannot resurrect the
    // deleted patient data from a stale file.
    saveDb();

    await logActivity(
      req.user?.id ?? null,
      "Data Deleted",
      `User ${req.user?.username ?? "Unknown"} deleted all session data`,
    );
    void logSystem("WARNING", "System", "All session data deleted", {
      by: req.user?.username ?? "Unknown",
    });

    res.json({ status: "deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete data" });
  }
});

// Get idle timeout setting (public read used by the kiosk)
router.get("/idle-timeout", async (_req, res) => {
  try {
    const rows = await query("SELECT value FROM settings WHERE key = 'idle_timeout_seconds'");
    const seconds = (rows && rows.length > 0) ? parseInt(rows[0].value, 10) : 120;
    res.json({ seconds });
  } catch (e) {
    res.status(500).json({ error: "Failed to get idle timeout setting" });
  }
});

// Set idle timeout setting (authenticated)
router.post("/idle-timeout", requireAuth, async (req, res) => {
  try {
    const { seconds } = req.body ?? {};
    const parsed = parseInt(seconds, 10);
    if (!parsed || isNaN(parsed) || parsed < 30 || parsed > 3600) {
      res.status(400).json({ error: "Timeout must be between 30 and 3600 seconds" });
      return;
    }
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('idle_timeout_seconds', ?)", [parsed.toString()]);
    await logActivity(
      req.user?.id ?? null,
      "Idle Timeout Changed",
      `Idle timeout set to ${parsed} seconds by ${req.user?.username ?? "Unknown"}`,
    );
    res.json({ success: true, seconds: parsed });
  } catch (e) {
    res.status(500).json({ error: "Failed to set idle timeout setting" });
  }
});

// Get network connection enabled setting (public read used by the kiosk)
router.get("/network-enabled", async (_req, res) => {
  try {
    const rows = await query("SELECT value FROM settings WHERE key = 'network_enabled'");
    const enabled = rows && rows.length > 0 ? rows[0].value === "true" : true;
    res.json({ enabled });
  } catch (e) {
    res.status(500).json({ error: "Failed to get network connection setting" });
  }
});

// Set network connection enabled setting (authenticated)
router.post("/network-enabled", requireAuth, async (req, res) => {
  try {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean" });
      return;
    }
    const wifiScript = path.resolve(workspaceRoot, "hardware", "wifi.py");
    try {
      await execFileAsync("python3", [wifiScript, "radio", enabled ? "on" : "off"], { timeout: 20000 });
    } catch (err: any) {
      const msg = getWifiCommandError(err);
      if (isWifiPermissionError(msg)) {
        res.status(403).json({
          error: `Linux denied the Wi-Fi radio change: ${msg}. Allow the API service user to run nmcli radio wifi on/off with sudo, or grant it NetworkManager radio-control permission.`,
        });
        return;
      }
      res.status(500).json({ error: `Failed to turn Wi-Fi ${enabled ? "on" : "off"}: ${msg}` });
      return;
    }
    const val = enabled ? "true" : "false";
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('network_enabled', ?)", [val]);
    await logActivity(
      req.user?.id ?? null,
      "Network Connection Toggled",
      `Network connection ${enabled ? "enabled" : "disabled"} by ${req.user?.username ?? "Unknown"}`,
    );
    void logSystem(
      enabled ? "INFO" : "WARNING",
      "Network",
      `Network connection ${enabled ? "enabled" : "disabled"}`,
      { by: req.user?.username ?? "Unknown" },
    );
    res.json({ success: true, enabled: !!enabled });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to set network connection setting" });
  }
});

// Get recent sessions visibility setting (public read used by the kiosk)
router.get("/recent-sessions", async (_req, res) => {
  try {
    const rows = await query("SELECT value FROM settings WHERE key = 'recent_sessions_enabled'");
    const enabled = rows && rows.length > 0 ? rows[0].value === "true" : true;
    res.json({ enabled });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to get recent sessions setting" });
  }
});

// Set recent sessions visibility setting (authenticated). When enabled, the
// home screen widget shows recent sessions to everyone with masked names
// (first letter only) and no clickable entries; when disabled, it stays locked.
router.post("/recent-sessions", requireAuth, async (req, res) => {
  try {
    const { enabled } = req.body ?? {};
    if (typeof enabled !== "boolean") {
      res.status(400).json({ error: "enabled must be a boolean" });
      return;
    }
    const val = enabled ? "true" : "false";
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('recent_sessions_enabled', ?)", [val]);
    await logActivity(
      req.user?.id ?? null,
      "Recent Sessions Toggled",
      `Recent sessions widget ${enabled ? "enabled (names masked)" : "disabled"} by ${req.user?.username ?? "Unknown"}`,
    );
    res.json({ success: true, enabled });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || "Failed to set recent sessions setting" });
  }
});

// Check connection to the configured server (authenticated). The server link
// is configured via RISECARE_PORTAL_URL (env) only; there is no runtime
// override, so this reports the resolved portal URL.
router.get("/server-connection", requireAuth, async (_req, res) => {
  try {
    const link = await getPortalBaseUrl();
    if (!link) {
      res.json({ connected: false, link });
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const resp = await fetch(link, { method: "GET", signal: controller.signal });
      res.json({ connected: true, link, status: resp.status });
    } catch {
      res.json({ connected: false, link });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    res.status(500).json({ error: "Failed to check server connection", connected: false });
  }
});

// Export pending records to the configured server (offline-first sync).
// Delegates to the shared sync service which handles batching, idempotency
// and exponential backoff (authenticated, requires recent re-auth)
router.post("/export-server", requireAuth, requireReauth, async (req, res) => {
  try {
    const result = await syncPending();
    await logActivity(
      req.user?.id ?? null,
      "Reports Exported",
      `${result.exported} record(s) synced to server by ${req.user?.username ?? "Unknown"}`,
    );
    void logSystem("INFO", "Sync", "Manual report export completed", {
      exported: result.exported,
      by: req.user?.username ?? "Unknown",
    });
    res.json({ success: true, ...result });
  } catch (e) {
    if (e instanceof SyncError) {
      res.status(e.permanent ? 400 : 502).json({ error: e.message, code: e.code });
      return;
    }
    res.status(502).json({ error: "Failed to sync records" });
  }
});

export default router;
