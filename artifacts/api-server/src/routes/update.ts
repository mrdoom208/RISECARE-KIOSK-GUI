import { Router, type IRouter } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import { workspaceRoot } from "@workspace/db";
import { requireAuth, requireSuperadmin, requireReauth, sensitiveLimiter } from "../auth";
import { logActivity } from "../activity-log";
import { logSystem } from "../system-log";
import { appVersion } from "./system";

// Check for Updates: compare the installed commit with origin/main and
// fast-forward to it when the admin confirms.

const execFileAsync = promisify(execFile);

const router: IRouter = Router();

interface CommitInfo {
  hash: string;
  shortHash: string;
  subject: string;
  date: string;
  author: string;
}

async function readCommit(root: string, ref: string): Promise<CommitInfo | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", root, "log", "-1", "--format=%H%n%h%n%s%n%cI%n%an", ref],
      { timeout: 10000 },
    );
    const [hash, shortHash, subject, date, author] = stdout.trim().split("\n");
    if (!hash) return null;
    return {
      hash,
      shortHash: shortHash || hash.slice(0, 7),
      subject: subject || "(no commit message)",
      date: date || "",
      author: author || "",
    };
  } catch {
    return null;
  }
}

// Version recorded on origin/main, so the dialog can show "update to vX".
async function readRemoteVersion(root: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", root, "show", "origin/main:package.json"],
      { timeout: 10000 },
    );
    const version = JSON.parse(stdout)?.version;
    return typeof version === "string" ? version : null;
  } catch {
    return null;
  }
}

// Current build details for the update dialog (no network access).
router.get("/update/info", requireAuth, requireSuperadmin, async (_req, res) => {
  try {
    const local = await readCommit(workspaceRoot, "HEAD");
    res.json({ local, version: appVersion });
  } catch {
    res.json({ local: null, version: appVersion });
  }
});

router.get("/update/check", requireAuth, requireSuperadmin, async (_req, res) => {
  try {
    const root = workspaceRoot;
    try {
      await execFileAsync("git", ["-C", root, "fetch", "--all", "--prune"], { timeout: 30000 });
    } catch {
      await execFileAsync("git", ["-C", root, "fetch", "origin", "main"], { timeout: 30000 });
    }
    const localCommit = await readCommit(root, "HEAD");
    const remoteCommit = await readCommit(root, "origin/main");
    const remoteVersion = await readRemoteVersion(root);
    const localHash = localCommit?.hash ?? "";
    const remoteHash = remoteCommit?.hash ?? "";
    if (!localHash || !remoteHash) {
      res.status(500).json({ error: "Could not determine the installed or available commit" });
      return;
    }

    const { stdout: counts } = await execFileAsync(
      "git",
      ["-C", root, "rev-list", "--left-right", "--count", "HEAD...origin/main"],
      { timeout: 10000 },
    );
    const [localOnly, remoteOnly] = counts.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(localOnly) || !Number.isFinite(remoteOnly)) {
      throw new Error("Could not compare the installed and available commits");
    }

    res.json({
      hasUpdate: localOnly === 0 && remoteOnly > 0,
      version: appVersion,
      remoteVersion,
      localHash,
      remoteHash,
      local: localCommit,
      remote: remoteCommit,
      diverged: localOnly > 0 && remoteOnly > 0,
      localAhead: localOnly > 0 && remoteOnly === 0,
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to check for updates" });
  }
});

// Apply updates. The system is not rebooted automatically; the user is told to
// restart so the new version takes effect.
router.post("/update/apply", requireAuth, requireSuperadmin, requireReauth, sensitiveLimiter, async (req, res) => {
  try {
    const root = workspaceRoot;
    try {
      await execFileAsync("git", ["-C", root, "fetch", "--all", "--prune"], { timeout: 30000 });
    } catch {
      await execFileAsync("git", ["-C", root, "fetch", "origin", "main"], { timeout: 30000 });
    }
    const { stdout: counts } = await execFileAsync(
      "git",
      ["-C", root, "rev-list", "--left-right", "--count", "HEAD...origin/main"],
      { timeout: 10000 },
    );
    const [localOnly, remoteOnly] = counts.trim().split(/\s+/).map(Number);
    if (!Number.isFinite(localOnly) || !Number.isFinite(remoteOnly)) {
      throw new Error("Could not compare the installed and available commits");
    }
    if (localOnly !== 0) {
      res.status(409).json({
        error: "The installed version has local commits and cannot be updated automatically. Resolve the branch state before applying this update.",
      });
      return;
    }
    if (remoteOnly === 0) {
      res.status(409).json({ error: "No newer update is available on origin/main" });
      return;
    }

    // Fast-forward only: this fails safely if the workspace has local changes
    // and never discards files like reset --hard would.
    await execFileAsync("git", ["-C", root, "merge", "--ff-only", "origin/main"], { timeout: 60000 });
    await logActivity(req.user?.id ?? null, "System Update", "Applied update from origin/main; restart required to take effect");
    void logSystem("INFO", "Backend", "System update applied; restart required to take effect");
    res.json({ success: true, restartRequired: true });
  } catch (e: any) {
    res.status(500).json({ error: e.message || "Failed to apply update" });
  }
});

export default router;
