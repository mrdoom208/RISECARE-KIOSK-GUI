import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { run, query } from "@workspace/db";
import { requireAuth, requireSuperadmin } from "../auth";
import { logActivity } from "../activity-log";

// Admin account management: register, list, edit, remove, and the activity
// log that audits those actions.

const BCRYPT_ROUNDS = 10;
const MIN_PASSWORD_LENGTH = 12;

const router: IRouter = Router();

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

export default router;
