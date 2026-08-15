import { Router, type IRouter } from "express";
import { execFile } from "child_process";
import { promisify } from "util";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { existsSync } from "fs";
import { query } from "@workspace/db";
import { requireAuth } from "../auth";

const execFileAsync = promisify(execFile);

const router: IRouter = Router();

function findWorkspaceRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);

  let currentDir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(currentDir, "pnpm-workspace.yaml"))) {
      return currentDir;
    }
    const parent = resolve(currentDir, "..");
    if (parent === currentDir) break;
    currentDir = parent;
  }

  return resolve(__dirname, "..", "..", "..");
}

const workspaceRoot = findWorkspaceRoot();
const WIFI_SCRIPT = resolve(workspaceRoot, "hardware", "wifi.py");

async function runWifi(args: string[]) {
  const { stdout } = await execFileAsync("python3", [WIFI_SCRIPT, ...args], {
    timeout: 30000,
  });
  return JSON.parse(stdout);
}

async function isNetworkEnabled(): Promise<boolean> {
  const rows = await query("SELECT value FROM settings WHERE key = 'network_enabled'");
  return !rows || rows.length === 0 ? true : rows[0].value === "true";
}

async function requireNetworkEnabled(
  req: import("express").Request,
  res: import("express").Response,
  next: import("express").NextFunction,
) {
  const enabled = await isNetworkEnabled();
  if (!enabled) {
    res.status(403).json({ error: "Network connection is disabled" });
    return;
  }
  next();
}

router.get("/network/status", requireAuth, requireNetworkEnabled, async (_req, res) => {
  try {
    const result = await runWifi(["status"]);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message, online: false });
  }
});

router.get("/network/wifi/scan", requireAuth, requireNetworkEnabled, async (_req, res) => {
  try {
    const result = await runWifi(["scan"]);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/network/wifi/connect", requireAuth, requireNetworkEnabled, async (req, res) => {
  const { ssid, password } = req.body ?? {};
  if (!ssid || typeof ssid !== "string") {
    res.status(400).json({ error: "ssid required" });
    return;
  }

  try {
    const args = ["connect", ssid];
    if (typeof password === "string" && password) args.push(password);
    const result = await runWifi(args);
    if (result.error) {
      res.status(400).json(result);
      return;
    }
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.post("/network/wifi/disconnect", requireAuth, requireNetworkEnabled, async (_req, res) => {
  try {
    const result = await runWifi(["disconnect"]);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
