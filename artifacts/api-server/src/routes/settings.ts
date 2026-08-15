import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import rateLimit from "express-rate-limit";
import { run, query } from "@workspace/db";
import { publish } from "../mqtt";
import { requireAuth, requireReauth, requireSuperadmin, REAUTH_TTL_MS } from "../auth";
import { logActivity } from "../activity-log";
import path from "path";
import fs from "fs";

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 12;

function findWorkspaceRoot(): string {
  let currentDir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.resolve(currentDir, "pnpm-workspace.yaml"))) {
      return currentDir;
    }
    const parent = path.resolve(currentDir, "..");
    if (parent === currentDir) break;
    currentDir = parent;
  }
  return process.cwd();
}

function getDbPath(): string {
  const root = findWorkspaceRoot();
  const envPath = path.resolve(root, ".env");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    const match = envContent.match(/DATABASE_URL=(.+)/);
    if (match) {
      return path.resolve(root, match[1].trim());
    }
  }
  return path.resolve(root, "risecare.sqlite");
}

const dbPath = getDbPath();

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

const sensitiveLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res, _next, options) => {
    res.status(429).json({ error: "rate_limited", message: options.message });
  },
});

function isHashed(password: string): boolean {
  return typeof password === "string" && /^\$2[aby]\$/.test(password);
}

function normalizeRole(role: any): "superadmin" | "admin" | null {
  return role === "superadmin" ? "superadmin" : role === "admin" ? "admin" : null;
}

function publicAccount(account: any) {
  return { id: account.id, username: account.username, role: account.role };
}

// Register a new admin account (superadmin only)
router.post("/register", requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const { username, password, role } = req.body ?? {};
    if (typeof username !== "string" || !username.trim()) {
      res.status(400).json({ error: "Username is required" });
      return;
    }
    if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
      res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
      return;
    }
    const normalizedRole = normalizeRole(role);
    if (!normalizedRole) {
      res.status(400).json({ error: "Role must be 'superadmin' or 'admin'" });
      return;
    }

    const existing = await query("SELECT id FROM accounts WHERE username = ?", [username.trim()]);
    if (existing && existing.length > 0) {
      res.status(409).json({ error: "An account with that username already exists" });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const result = await run("INSERT INTO accounts (username, password, role) VALUES (?, ?, ?)", [
      username.trim(),
      hashedPassword,
      normalizedRole,
    ]);

    const account = { id: result?.lastInsertRowid, username: username.trim(), role: normalizedRole };
    await logActivity(
      account.id,
      "Account Created",
      `${normalizedRole === "superadmin" ? "Super admin" : "Admin"} account "${username.trim()}" was created by ${req.user?.username}`,
    );

    res.json({ success: true, account });
  } catch (e) {
    res.status(500).json({ error: "Failed to create account" });
  }
});

// List accounts (superadmin only)
router.get("/accounts", requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const roleFilter = req.query.role;
    let sql = "SELECT id, username, role, created_at FROM accounts";
    const params: any[] = [];
    if (roleFilter === "superadmin" || roleFilter === "admin") {
      sql += " WHERE role = ?";
      params.push(roleFilter);
    }
    sql += " ORDER BY created_at DESC";
    const accounts = await query(sql, params);
    res.json(accounts || []);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

// Current signed-in account profile (any authenticated user)
router.get("/me", requireAuth, async (req, res) => {
  try {
    const rows = await query("SELECT id, username, role, created_at FROM accounts WHERE id = ?", [
      req.user?.id ?? 0,
    ]);
    if (!rows || rows.length === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }
    res.json(rows[0]);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch profile" });
  }
});

// Edit an account (superadmin only)
router.put("/accounts/:id", requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const accountId = Number(req.params.id);
    if (!accountId) {
      res.status(400).json({ error: "Invalid account id" });
      return;
    }

    const existing = await query("SELECT * FROM accounts WHERE id = ?", [accountId]);
    if (!existing || existing.length === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    if (existing[0].role === "superadmin" && req.user?.id !== accountId) {
      res.status(403).json({ error: "You cannot modify another super admin account" });
      return;
    }

    const { username, password, role } = req.body ?? {};
    const newRole = normalizeRole(role) ?? existing[0].role;

    if (newRole !== existing[0].role && existing[0].role === "superadmin") {
      const superadmins = await query("SELECT id FROM accounts WHERE role = 'superadmin'");
      if (superadmins.length <= 1) {
        res.status(400).json({ error: "Cannot change the role of the last super admin" });
        return;
      }
    }

    const updates: string[] = [];
    const params: any[] = [];

    if (typeof username === "string" && username.trim() && username.trim() !== existing[0].username) {
      const conflict = await query("SELECT id FROM accounts WHERE username = ? AND id != ?", [
        username.trim(),
        accountId,
      ]);
      if (conflict && conflict.length > 0) {
        res.status(409).json({ error: "An account with that username already exists" });
        return;
      }
      updates.push("username = ?");
      params.push(username.trim());
    }
    if (typeof password === "string" && password.length > 0) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
        return;
      }
      updates.push("password = ?");
      params.push(await bcrypt.hash(password, BCRYPT_ROUNDS));
    }
    if (newRole !== existing[0].role) {
      updates.push("role = ?");
      params.push(newRole);
    }

    if (updates.length > 0) {
      await run(`UPDATE accounts SET ${updates.join(", ")} WHERE id = ?`, [...params, accountId]);
      await logActivity(
        req.user?.id ?? null,
        "Account Updated",
        `User ${req.user?.username ?? "Unknown"} updated account "${existing[0].username}"`,
      );
    }

    const updated = await query("SELECT id, username, role, created_at FROM accounts WHERE id = ?", [accountId]);
    res.json({ success: true, account: updated[0] });
  } catch (e) {
    res.status(500).json({ error: "Failed to update account" });
  }
});

// Remove an account (superadmin only)
router.delete("/accounts/:id", requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const accountId = Number(req.params.id);
    if (!accountId) {
      res.status(400).json({ error: "Invalid account id" });
      return;
    }

    if (req.user?.id === accountId) {
      res.status(403).json({ error: "You cannot remove your own account" });
      return;
    }

    const existing = await query("SELECT * FROM accounts WHERE id = ?", [accountId]);
    if (!existing || existing.length === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    if (existing[0].role === "superadmin") {
      res.status(403).json({ error: "You cannot remove another super admin account" });
      return;
    }

    await run("DELETE FROM accounts WHERE id = ?", [accountId]);
    await logActivity(
      req.user?.id ?? null,
      "Account Removed",
      `User ${req.user?.username ?? "Unknown"} removed account "${existing[0].username}"`,
    );

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to remove account" });
  }
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
            await bcrypt.hash(password, BCRYPT_ROUNDS),
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

      res.json({ success: true, account: publicAccount(account) });
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

// Get activity logs (superadmin only)
router.get("/logs", requireAuth, requireSuperadmin, async (_req, res) => {
  try {
    const logs = await query(`
      SELECT activity_log.*, accounts.username as account_name
      FROM activity_log
      LEFT JOIN accounts ON activity_log.account_id = accounts.id
      ORDER BY created_at DESC
      LIMIT 100
    `);
    res.json(logs || []);
  } catch (e) {
    res.json([]);
  }
});

// Export database (superadmin, requires recent re-auth)
router.get("/export", requireAuth, requireSuperadmin, requireReauth, async (req, res) => {
  try {
    if (!fs.existsSync(dbPath)) {
      res.status(404).json({ error: "Database not found" });
      return;
    }

    await logActivity(
      req.user?.id ?? null,
      "Database Exported",
      `User ${req.user?.username ?? "Unknown"} exported the database`,
    );

    res.download(dbPath, `risecare-backup-${Date.now()}.db`);
  } catch (e) {
    res.status(500).json({ error: "Failed to export database" });
  }
});

// Import database (superadmin, requires recent re-auth)
router.post("/import", requireAuth, requireSuperadmin, requireReauth, async (req, res) => {
  try {
    await logActivity(
      req.user?.id ?? null,
      "Database Imported",
      `User ${req.user?.username ?? "Unknown"} imported a database`,
    );

    res.json({ status: "imported" });
  } catch (e) {
    res.status(500).json({ error: "Failed to import database" });
  }
});

// Get AI mode setting (public read used by the kiosk)
router.get("/ai-mode", async (_req, res) => {
  try {
    const rows = await query("SELECT value FROM settings WHERE key = 'ai_mode'");
    const mode = (rows && rows.length > 0) ? rows[0].value : "integrated";
    res.json({ mode });
  } catch (e) {
    res.status(500).json({ error: "Failed to get AI mode" });
  }
});

// Set AI mode setting (authenticated)
router.post("/ai-mode", requireAuth, async (req, res) => {
  try {
    const { mode } = req.body ?? {};
    if (mode !== "integrated" && mode !== "rule-based") {
      res.status(400).json({ error: "Mode must be 'integrated' or 'rule-based'" });
      return;
    }
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_mode', ?)", [mode]);
    await logActivity(
      req.user?.id ?? null,
      "AI Mode Changed",
      `AI mode set to "${mode}" by ${req.user?.username ?? "Unknown"}`,
    );
    res.json({ success: true, mode });
  } catch (e) {
    res.status(500).json({ error: "Failed to set AI mode" });
  }
});

// Delete all data (superadmin, requires recent re-auth)
router.post("/delete", requireAuth, requireSuperadmin, requireReauth, async (req, res) => {
  try {
    await run("DELETE FROM vital_readings");
    await run("DELETE FROM sessions");

    await logActivity(
      req.user?.id ?? null,
      "Data Deleted",
      `User ${req.user?.username ?? "Unknown"} deleted all session data`,
    );

    res.json({ status: "deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete data" });
  }
});

// Get recommendation enabled setting (public read used by the kiosk)
router.get("/recommendation", async (_req, res) => {
  try {
    const rows = await query("SELECT value FROM settings WHERE key = 'recommendation_enabled'");
    const enabled = (rows && rows.length > 0) ? rows[0].value === "true" : true;
    res.json({ enabled });
  } catch (e) {
    res.status(500).json({ error: "Failed to get recommendation setting" });
  }
});

// Set recommendation enabled setting (authenticated)
router.post("/recommendation", requireAuth, async (req, res) => {
  try {
    const { enabled } = req.body ?? {};
    const val = enabled ? "true" : "false";
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('recommendation_enabled', ?)", [val]);
    await logActivity(
      req.user?.id ?? null,
      "Recommendation Toggled",
      `Recommendations ${enabled ? 'enabled' : 'disabled'} by ${req.user?.username ?? "Unknown"}`,
    );
    res.json({ success: true, enabled: !!enabled });
  } catch (e) {
    res.status(500).json({ error: "Failed to set recommendation setting" });
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
    const val = enabled ? "true" : "false";
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('network_enabled', ?)", [val]);
    await logActivity(
      req.user?.id ?? null,
      "Network Connection Toggled",
      `Network connection ${enabled ? "enabled" : "disabled"} by ${req.user?.username ?? "Unknown"}`,
    );
    res.json({ success: true, enabled: !!enabled });
  } catch (e) {
    res.status(500).json({ error: "Failed to set network connection setting" });
  }
});

// Get server link setting (authenticated)
router.get("/server-link", requireAuth, async (_req, res) => {
  try {
    const rows = await query("SELECT value FROM settings WHERE key = 'server_link'");
    const link = rows && rows.length > 0 ? rows[0].value : "";
    res.json({ link });
  } catch (e) {
    res.status(500).json({ error: "Failed to get server link" });
  }
});

// Set server link setting (authenticated)
router.post("/server-link", requireAuth, async (req, res) => {
  try {
    const link = (req.body?.link ?? "").toString().trim();
    if (link && !/^https?:\/\//i.test(link)) {
      res.status(400).json({ error: "Server link must start with http:// or https://" });
      return;
    }
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('server_link', ?)", [link]);
    await logActivity(
      req.user?.id ?? null,
      "Server Link Changed",
      `Server link set to "${link}" by ${req.user?.username ?? "Unknown"}`,
    );
    res.json({ success: true, link });
  } catch (e) {
    res.status(500).json({ error: "Failed to set server link" });
  }
});

// Check connection to the configured server (authenticated)
router.get("/server-connection", requireAuth, async (_req, res) => {
  try {
    const rows = await query("SELECT value FROM settings WHERE key = 'server_link'");
    const link = rows && rows.length > 0 ? rows[0].value : "";
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

// Export reports to the configured server (authenticated, requires recent re-auth)
router.post("/export-server", requireAuth, requireReauth, async (req, res) => {
  try {
    const rows = await query("SELECT value FROM settings WHERE key = 'server_link'");
    const link = rows && rows.length > 0 ? rows[0].value : "";
    if (!link) {
      res.status(400).json({ error: "No server link configured" });
      return;
    }

    const sessions = await query(`
      SELECT id, token, patient_first_name AS patientFirstName, patient_last_name AS patientLastName,
             TRIM(patient_first_name || ' ' || patient_last_name) AS patientName,
             patient_phone AS patientPhone,
             patient_age AS patientAge, patient_gender AS patientGender,
             started_at AS startedAt, completed_at AS completedAt
      FROM sessions ORDER BY started_at DESC
    `);
    const vitals = await query(`
      SELECT id, session_id AS sessionId, blood_pressure_systolic AS bloodPressureSystolic,
             blood_pressure_diastolic AS bloodPressureDiastolic, heart_rate AS heartRate,
             oxygen_saturation AS oxygenSaturation, temperature, weight, height, bmi, notes,
             recorded_at AS recordedAt
      FROM vital_readings
    `);

    const payload = {
      source: "risecare-kiosk",
      exportedAt: new Date().toISOString(),
      sessions,
      vitals,
    };

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    try {
      const resp = await fetch(link, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!resp.ok) {
        res.status(502).json({ error: `Server returned ${resp.status}` });
        return;
      }
      await logActivity(
        req.user?.id ?? null,
        "Reports Exported",
        `Exported reports to ${link} by ${req.user?.username ?? "Unknown"}`,
      );
      res.json({ success: true, exported: sessions.length });
    } catch {
      res.status(502).json({ error: "Failed to reach server" });
    } finally {
      clearTimeout(timer);
    }
  } catch (e) {
    res.status(500).json({ error: "Failed to export reports" });
  }
});

// Send a power command (shutdown / restart / lock) via MQTT
async function sendPowerCommand(
  req: any,
  res: any,
  action: string,
) {
  try {
    const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);
    await logActivity(
      req.user?.id ?? null,
      `System ${actionLabel}`,
      `User ${req.user?.username ?? "Unknown"} initiated system ${action}`,
    );

    const sent = publish(`risecare/command/${action}`, {
      sensor: action,
      value: 1,
      timestamp: new Date().toISOString(),
    });

    if (sent) {
      res.json({ success: true, action, message: `${actionLabel} command sent` });
    } else {
      res.status(503).json({ error: "MQTT not connected" });
    }
  } catch (e) {
    res.status(500).json({ error: `Failed to send ${action} command` });
  }
}

// Power commands: shutdown / restart / lock (authenticated, requires recent re-auth)
router.post("/power", requireAuth, requireReauth, sensitiveLimiter, async (req, res) => {
  const { action } = req.body ?? {};
  if (action !== "shutdown" && action !== "restart" && action !== "lock") {
    res.status(400).json({ error: "Action must be 'shutdown', 'restart', or 'lock'" });
    return;
  }
  await sendPowerCommand(req, res, action);
});

// Backward-compatible alias for shutdown
router.post("/shutdown", requireAuth, requireReauth, sensitiveLimiter, async (req, res) => {
  await sendPowerCommand(req, res, "shutdown");
});

export default router;
