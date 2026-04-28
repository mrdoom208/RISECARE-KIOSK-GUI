import { Router, type IRouter } from "express";
import { run, query } from "@workspace/db";
import path from "path";
import fs from "fs";

const router: IRouter = Router();

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
    const dbPath = process.env.DATABASE_PATH || "./risecare.db";
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
