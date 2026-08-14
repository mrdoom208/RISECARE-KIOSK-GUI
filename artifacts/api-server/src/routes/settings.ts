import { Router, type IRouter } from "express";
import { run, query } from "@workspace/db";
import { publish } from "../mqtt";
import path from "path";
import fs from "fs";

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

async function getAccountRole(accountId: any): Promise<string | null> {
  if (accountId == null) return null;
  const rows = await query("SELECT role FROM accounts WHERE id = ?", [accountId]);
  return rows && rows.length > 0 ? rows[0].role : null;
}

// Register a new admin account
router.post("/register", async (req, res) => {
  try {
    const { username, password, role } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: "Username and password are required" });
      return;
    }
    if (typeof username !== "string" || !username.trim()) {
      res.status(400).json({ error: "Username is required" });
      return;
    }
    if (typeof password !== "string" || password.length < 4) {
      res.status(400).json({ error: "Password must be at least 4 characters" });
      return;
    }
    const normalizedRole = role === "superadmin" ? "superadmin" : role === "admin" ? "admin" : null;
    if (!normalizedRole) {
      res.status(400).json({ error: "Role must be 'superadmin' or 'admin'" });
      return;
    }

    const callerRole = await getAccountRole(req.query.accountId);
    if (callerRole !== "superadmin") {
      res.status(403).json({ error: "Only super admins can create accounts" });
      return;
    }

    const existing = await query("SELECT id FROM accounts WHERE username = ?", [username]);
    if (existing && existing.length > 0) {
      res.status(409).json({ error: "An account with that username already exists" });
      return;
    }

    const result = await run(
      "INSERT INTO accounts (username, password, role) VALUES (?, ?, ?)",
      [username, password, normalizedRole],
    );

    const account = { id: result?.lastInsertRowid, username, role: normalizedRole };
    await run("INSERT INTO activity_log (account_id, action, details) VALUES (?, ?, ?)",
      [account.id, "Account Created", `${normalizedRole === "superadmin" ? "Super admin" : "Admin"} account "${username}" was created`]);

    res.json({ success: true, account });
  } catch (e) {
    res.status(500).json({ error: "Failed to create account" });
  }
});

// List accounts (optionally filtered by role). Only super admins can list accounts.
router.get("/accounts", async (req, res) => {
  try {
    const callerRole = await getAccountRole(req.query.accountId);
    if (callerRole !== "superadmin") {
      res.status(403).json({ error: "Only super admins can view accounts" });
      return;
    }

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

// Edit an account (superadmin only)
router.put("/accounts/:id", async (req, res) => {
  try {
    const callerRole = await getAccountRole(req.query.accountId);
    if (callerRole !== "superadmin") {
      res.status(403).json({ error: "Only super admins can edit accounts" });
      return;
    }

    const accountId = parseInt(req.params.id, 10);
    if (!accountId) {
      res.status(400).json({ error: "Invalid account id" });
      return;
    }

    const existing = await query("SELECT * FROM accounts WHERE id = ?", [accountId]);
    if (!existing || existing.length === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    const { username, password, role } = req.body;
    const newRole = role === "superadmin" ? "superadmin" : role === "admin" ? "admin" : existing[0].role;

    const updates: string[] = [];
    const params: any[] = [];

    if (typeof username === "string" && username.trim() && username.trim() !== existing[0].username) {
      const conflict = await query("SELECT id FROM accounts WHERE username = ? AND id != ?", [username.trim(), accountId]);
      if (conflict && conflict.length > 0) {
        res.status(409).json({ error: "An account with that username already exists" });
        return;
      }
      updates.push("username = ?");
      params.push(username.trim());
    }
    if (typeof password === "string" && password.length > 0) {
      if (password.length < 4) {
        res.status(400).json({ error: "Password must be at least 4 characters" });
        return;
      }
      updates.push("password = ?");
      params.push(password);
    }
    if (newRole !== existing[0].role) {
      updates.push("role = ?");
      params.push(newRole);
    }

    if (updates.length > 0) {
      await run(`UPDATE accounts SET ${updates.join(", ")} WHERE id = ?`, [...params, accountId]);
      const accountName = (req.query.accountName as string) || "Unknown";
      await run("INSERT INTO activity_log (account_id, action, details) VALUES (?, ?, ?)",
        [req.query.accountId || null, "Account Updated", `User ${accountName} updated account "${existing[0].username}"`]);
    }

    const updated = await query("SELECT id, username, role, created_at FROM accounts WHERE id = ?", [accountId]);
    res.json({ success: true, account: updated[0] });
  } catch (e) {
    res.status(500).json({ error: "Failed to update account" });
  }
});

// Remove an account (superadmin only)
router.delete("/accounts/:id", async (req, res) => {
  try {
    const callerRole = await getAccountRole(req.query.accountId);
    if (callerRole !== "superadmin") {
      res.status(403).json({ error: "Only super admins can remove accounts" });
      return;
    }

    const accountId = parseInt(req.params.id, 10);
    if (!accountId) {
      res.status(400).json({ error: "Invalid account id" });
      return;
    }

    if (Number(req.query.accountId) === accountId) {
      res.status(403).json({ error: "You cannot remove your own account" });
      return;
    }

    const existing = await query("SELECT * FROM accounts WHERE id = ?", [accountId]);
    if (!existing || existing.length === 0) {
      res.status(404).json({ error: "Account not found" });
      return;
    }

    if (existing[0].role === "superadmin") {
      const superadmins = await query("SELECT id FROM accounts WHERE role = 'superadmin'");
      if (superadmins.length <= 1) {
        res.status(400).json({ error: "Cannot remove the last super admin" });
        return;
      }
    }

    await run("DELETE FROM accounts WHERE id = ?", [accountId]);
    const accountName = (req.query.accountName as string) || "Unknown";
    await run("INSERT INTO activity_log (account_id, action, details) VALUES (?, ?, ?)",
      [req.query.accountId || null, "Account Removed", `User ${accountName} removed account "${existing[0].username}"`]);

    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: "Failed to remove account" });
  }
});

// Login with username + password
router.post("/login", async (req, res) => {
  try {
    const { username, password, context } = req.body;
    if (!username || !password) {
      res.json({ success: false, error: "Username and password are required" });
      return;
    }
    const accounts = await query("SELECT * FROM accounts WHERE username = ? AND password = ?", [username, password]);

    if (accounts && accounts.length > 0) {
      const account = accounts[0];
      // Log activity
      const action = context === "history" ? "History Accessed" : "Settings Accessed";
      const details = context === "history" ? "User opened session history" : "User opened settings menu";
      await run("INSERT INTO activity_log (account_id, action, details) VALUES (?, ?, ?)",
        [account.id, action, details]);

      res.json({ success: true, account: { id: account.id, username: account.username, role: account.role } });
    } else {
      res.json({ success: false, error: "Invalid username or password" });
    }
  } catch (e) {
    res.status(500).json({ error: "Failed to login" });
  }
});

// Get activity logs (superadmin only)
router.get("/logs", async (req, res) => {
  try {
    const callerRole = await getAccountRole(req.query.accountId);
    if (callerRole !== "superadmin") {
      res.status(403).json({ error: "Only super admins can view activity logs" });
      return;
    }

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

// Export database
router.get("/export", async (req, res) => {
  try {
    if (!fs.existsSync(dbPath)) {
      res.status(404).json({ error: "Database not found" });
      return;
    }

    const accountId = req.query.accountId;
    const accountName = req.query.accountName as string;

    await run("INSERT INTO activity_log (account_id, action, details) VALUES (?, ?, ?)",
      [accountId || null, "Database Exported", `User ${accountName || 'Unknown'} exported the database`]);

    res.download(dbPath, `risecare-backup-${Date.now()}.db`);
  } catch (e) {
    res.status(500).json({ error: "Failed to export database" });
  }
});

// Import database
router.post("/import", async (req, res) => {
  try {
    const accountId = req.query.accountId;
    const accountName = req.query.accountName as string;

    await run("INSERT INTO activity_log (account_id, action, details) VALUES (?, ?, ?)",
      [accountId || null, "Database Imported", `User ${accountName || 'Unknown'} imported a database`]);

    res.json({ status: "imported" });
  } catch (e) {
    res.status(500).json({ error: "Failed to import database" });
  }
});

// Get AI mode setting
router.get("/ai-mode", async (_req, res) => {
  try {
    const rows = await query("SELECT value FROM settings WHERE key = 'ai_mode'");
    const mode = (rows && rows.length > 0) ? rows[0].value : "integrated";
    res.json({ mode });
  } catch (e) {
    res.status(500).json({ error: "Failed to get AI mode" });
  }
});

// Set AI mode setting
router.post("/ai-mode", async (req, res) => {
  try {
    const { mode } = req.body;
    if (mode !== "integrated" && mode !== "rule-based") {
      res.status(400).json({ error: "Mode must be 'integrated' or 'rule-based'" });
      return;
    }
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_mode', ?)", [mode]);
    const accountId = req.query.accountId;
    const accountName = req.query.accountName as string;
    await run("INSERT INTO activity_log (account_id, action, details) VALUES (?, ?, ?)",
      [accountId || null, "AI Mode Changed", `AI mode set to "${mode}" by ${accountName || 'Unknown'}`]);
    res.json({ success: true, mode });
  } catch (e) {
    res.status(500).json({ error: "Failed to set AI mode" });
  }
});

// Delete all data
router.post("/delete", async (req, res) => {
  try {
    const accountId = req.query.accountId;
    const accountName = req.query.accountName as string;

    await run("DELETE FROM vital_readings");
    await run("DELETE FROM sessions");

    await run("INSERT INTO activity_log (account_id, action, details) VALUES (?, ?, ?)",
      [accountId || null, "Data Deleted", `User ${accountName || 'Unknown'} deleted all session data`]);

    res.json({ status: "deleted" });
  } catch (e) {
    res.status(500).json({ error: "Failed to delete data" });
  }
});

// Get recommendation enabled setting
router.get("/recommendation", async (_req, res) => {
  try {
    const rows = await query("SELECT value FROM settings WHERE key = 'recommendation_enabled'");
    const enabled = (rows && rows.length > 0) ? rows[0].value === "true" : true;
    res.json({ enabled });
  } catch (e) {
    res.status(500).json({ error: "Failed to get recommendation setting" });
  }
});

// Set recommendation enabled setting
router.post("/recommendation", async (req, res) => {
  try {
    const { enabled } = req.body;
    const val = enabled ? "true" : "false";
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('recommendation_enabled', ?)", [val]);
    const accountId = req.query.accountId;
    const accountName = req.query.accountName as string;
    await run("INSERT INTO activity_log (account_id, action, details) VALUES (?, ?, ?)",
      [accountId || null, "Recommendation Toggled", `Recommendations ${enabled ? 'enabled' : 'disabled'} by ${accountName || 'Unknown'}`]);
    res.json({ success: true, enabled: !!enabled });
  } catch (e) {
    res.status(500).json({ error: "Failed to set recommendation setting" });
  }
});

// Get idle timeout setting
router.get("/idle-timeout", async (_req, res) => {
  try {
    const rows = await query("SELECT value FROM settings WHERE key = 'idle_timeout_seconds'");
    const seconds = (rows && rows.length > 0) ? parseInt(rows[0].value, 10) : 120;
    res.json({ seconds });
  } catch (e) {
    res.status(500).json({ error: "Failed to get idle timeout setting" });
  }
});

// Set idle timeout setting
router.post("/idle-timeout", async (req, res) => {
  try {
    const { seconds } = req.body;
    const parsed = parseInt(seconds, 10);
    if (!parsed || isNaN(parsed) || parsed < 30 || parsed > 3600) {
      res.status(400).json({ error: "Timeout must be between 30 and 3600 seconds" });
      return;
    }
    await run("INSERT OR REPLACE INTO settings (key, value) VALUES ('idle_timeout_seconds', ?)", [parsed.toString()]);
    const accountId = req.query.accountId;
    const accountName = req.query.accountName as string;
    await run("INSERT INTO activity_log (account_id, action, details) VALUES (?, ?, ?)",
      [accountId || null, "Idle Timeout Changed", `Idle timeout set to ${parsed} seconds by ${accountName || 'Unknown'}`]);
    res.json({ success: true, seconds: parsed });
  } catch (e) {
    res.status(500).json({ error: "Failed to set idle timeout setting" });
  }
});

// Send a power command (shutdown / restart / lock) via MQTT
async function sendPowerCommand(
  req: any,
  res: any,
  action: string,
) {
  try {
    const accountId = req.query.accountId;
    const accountName = req.query.accountName as string;

    const actionLabel = action.charAt(0).toUpperCase() + action.slice(1);
    await run("INSERT INTO activity_log (account_id, action, details) VALUES (?, ?, ?)",
      [accountId || null, `System ${actionLabel}`, `User ${accountName || 'Unknown'} initiated system ${action}`]);

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

// Power commands: shutdown / restart / lock
router.post("/power", async (req, res) => {
  const { action } = req.body;
  if (action !== "shutdown" && action !== "restart" && action !== "lock") {
    res.status(400).json({ error: "Action must be 'shutdown', 'restart', or 'lock'" });
    return;
  }
  await sendPowerCommand(req, res, action);
});

// Backward-compatible alias for shutdown
router.post("/shutdown", async (req, res) => {
  await sendPowerCommand(req, res, "shutdown");
});

export default router;
