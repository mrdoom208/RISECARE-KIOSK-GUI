import { Router, type IRouter } from "express";
import { run, query } from "@workspace/db";
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

// Register a new admin account
router.post("/register", async (req, res) => {
  try {
    const { name, passcode, role } = req.body;
    if (!name || !passcode) {
      res.status(400).json({ error: "Name and passcode are required" });
      return;
    }
    if (passcode.length !== 6) {
      res.status(400).json({ error: "Passcode must be 6 digits" });
      return;
    }

    const existing = await query("SELECT id FROM accounts WHERE name = ?", [name]);
    if (existing && existing.length > 0) {
      res.status(409).json({ error: "An account with that name already exists" });
      return;
    }

    const result = await run(
      "INSERT INTO accounts (name, passcode) VALUES (?, ?)",
      [name, passcode],
    );

    const account = { id: result?.lastInsertRowid, name, role: role || "admin" };
    await run("INSERT INTO activity_log (account_id, action, details) VALUES (?, ?, ?)",
      [account.id, "Account Created", `Admin account "${name}" was created`]);

    res.json({ success: true, account });
  } catch (e) {
    res.status(500).json({ error: "Failed to create account" });
  }
});

// List all admin accounts
router.get("/accounts", async (_req, res) => {
  try {
    const accounts = await query(
      "SELECT id, name, passcode, created_at FROM accounts ORDER BY created_at DESC"
    );
    res.json(accounts || []);
  } catch (e) {
    res.status(500).json({ error: "Failed to fetch accounts" });
  }
});

// Verify passcode
router.post("/verify-passcode", async (req, res) => {
  try {
    const { passcode } = req.body;
    const accounts = await query("SELECT * FROM accounts WHERE passcode = ?", [passcode]);

    if (accounts && accounts.length > 0) {
      const account = accounts[0];
      // Log activity
      await run("INSERT INTO activity_log (account_id, action, details) VALUES (?, ?, ?)",
        [account.id, "Settings Accessed", "User opened settings menu"]);

      res.json({ success: true, account });
    } else {
      res.json({ success: false, error: "Invalid passcode" });
    }
  } catch (e) {
    res.status(500).json({ error: "Failed to verify passcode" });
  }
});

// Get activity logs
router.get("/logs", async (_req, res) => {
  try {
    const logs = await query(`
      SELECT activity_log.*, accounts.name as account_name
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

export default router;
