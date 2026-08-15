import type { NextFunction, Request, Response } from "express";
import { query } from "@workspace/db";

export const REAUTH_TTL_MS = 5 * 60 * 1000;

export interface AuthAccount {
  id: number;
  username: string;
  role: string;
  password: string;
}

declare module "express-session" {
  interface SessionData {
    userId?: number;
    reauthUntil?: number;
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthAccount;
    }
  }
}

// Resolves the authenticated account from the server-side session. Never trusts
// anything supplied by the client (query params, body, headers).
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.session.userId;
    if (!userId) {
      res.status(401).json({ error: "unauthorized", message: "Not logged in" });
      return;
    }

    const rows = await query("SELECT id, username, role, password FROM accounts WHERE id = ?", [userId]);
    if (!rows || rows.length === 0) {
      req.session.destroy(() => undefined);
      res.status(401).json({ error: "unauthorized", message: "Account no longer exists" });
      return;
    }

    req.user = rows[0];
    next();
  } catch {
    res.status(500).json({ error: "internal", message: "Failed to authenticate" });
  }
}

export function requireSuperadmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "superadmin") {
    res.status(403).json({ error: "forbidden", message: "Super admin access required" });
    return;
  }
  next();
}

// Requires a recent password re-verification for destructive operations.
export function requireReauth(req: Request, res: Response, next: NextFunction) {
  const until = req.session.reauthUntil ?? 0;
  if (Date.now() > until) {
    res.status(401).json({ error: "reauth_required", message: "Please re-enter your password to continue" });
    return;
  }
  next();
}
