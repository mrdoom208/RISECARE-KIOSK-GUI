import { Router, type IRouter } from "express";
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { query, workspaceRoot, dbPath } from "@workspace/db";
import { requireAuth, requireSuperadmin } from "../auth";
import { logActivity } from "../activity-log";
import { getDeviceInfo, getPortalBaseUrl } from "../device";
import { isConnected } from "../mqtt";
import {
  SYSTEM_LOG_LEVELS,
  logSystem,
  systemLogRetention,
  type SystemLogLevel,
} from "../system-log";

const execFileAsync = promisify(execFile);

const router: IRouter = Router();

function resolveVersion(): string {
  const fromEnv = process.env.APP_VERSION?.trim();
  if (fromEnv) return fromEnv;
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(workspaceRoot, "package.json"), "utf-8"),
    );
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

export const appVersion = resolveVersion();

let buildCommit: string | null | undefined;

async function getBuildCommit(): Promise<string | null> {
  if (buildCommit !== undefined) return buildCommit;
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", workspaceRoot, "rev-parse", "--short", "HEAD"],
      { timeout: 3000 },
    );
    buildCommit = stdout.trim() || null;
  } catch {
    buildCommit = null;
  }
  return buildCommit;
}

interface LogFilter {
  whereSql: string;
  params: unknown[];
  level: string;
  component: string;
  search: string;
  from: string;
  to: string;
}

// Accepts either a plain YYYY-MM-DD date or an ISO timestamp from the UI and
// normalizes it to the UTC "YYYY-MM-DD HH:MM:SS" format used by SQLite.
function normalizeDateBoundary(value: unknown, endOfDay: boolean): string {
  if (typeof value !== "string" || !value.trim()) return "";
  const raw = value.trim();
  const isPlainDate = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const parsed = new Date(
    isPlainDate
      ? `${raw}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`
      : raw,
  );
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 19).replace("T", " ");
}

function buildLogFilter(rawQuery: Record<string, unknown>): LogFilter {
  const levelRaw =
    typeof rawQuery.level === "string" ? rawQuery.level.toUpperCase() : "";
  const level = SYSTEM_LOG_LEVELS.includes(levelRaw as SystemLogLevel)
    ? levelRaw
    : "";
  const component =
    typeof rawQuery.component === "string"
      ? rawQuery.component.trim().slice(0, 40)
      : "";
  const search =
    typeof rawQuery.search === "string"
      ? rawQuery.search.trim().slice(0, 100)
      : "";
  const from = normalizeDateBoundary(rawQuery.from, false);
  const to = normalizeDateBoundary(rawQuery.to, true);

  const clauses: string[] = [];
  const params: unknown[] = [];

  if (level) {
    clauses.push("level = ?");
    params.push(level);
  }
  if (component) {
    clauses.push("component = ?");
    params.push(component);
  }
  if (search) {
    const like = `%${search}%`;
    clauses.push("(message LIKE ? OR details LIKE ? OR component LIKE ?)");
    params.push(like, like, like);
  }
  if (from) {
    clauses.push("created_at >= ?");
    params.push(from);
  }
  if (to) {
    clauses.push("created_at <= ?");
    params.push(to);
  }

  return {
    whereSql: clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "",
    params,
    level,
    component,
    search,
    from,
    to,
  };
}

// Lightweight, fast status used by the Settings menu and Server Status screen.
// No external calls are made here, so it always answers quickly even when the
// portal or MQTT broker is unavailable.
router.get("/status", requireAuth, async (_req, res) => {
  const startedAt = Date.now();

  let databaseStatus: "ok" | "error" = "ok";
  try {
    await query("SELECT 1");
  } catch {
    databaseStatus = "error";
  }

  let portalLink: string | null = null;
  try {
    portalLink = await getPortalBaseUrl();
  } catch {
    portalLink = null;
  }

  let device = null;
  try {
    device = await getDeviceInfo();
  } catch {
    device = null;
  }

  res.json({
    online: true,
    status: databaseStatus === "ok" ? "online" : "degraded",
    checkedAt: new Date().toISOString(),
    responseTimeMs: Date.now() - startedAt,
    backend: {
      status: "online",
      version: appVersion,
      environment: process.env.NODE_ENV ?? "development",
      uptimeSeconds: Math.round(process.uptime()),
    },
    api: { status: "ok" },
    database: { status: databaseStatus },
    mqtt: {
      connected: isConnected(),
      broker: process.env.MQTT_BROKER || "mqtt://localhost:1883",
    },
    portal: { link: portalLink },
    device: device
      ? {
          kioskId: device.kioskId,
          kioskName: device.kioskName,
          kioskSite: device.kioskSite,
          activated: device.activated,
          syncState: device.syncState,
        }
      : null,
  });
});

// Device, service and storage information for the System Information screen.
router.get("/info", requireAuth, async (_req, res) => {
  const memory = process.memoryUsage();

  let databaseBytes = 0;
  try {
    databaseBytes = fs.statSync(dbPath).size;
  } catch {
    databaseBytes = 0;
  }

  let diskTotalBytes: number | null = null;
  let diskFreeBytes: number | null = null;
  try {
    const stats = fs.statfsSync(path.dirname(dbPath));
    diskTotalBytes = Number(stats.blocks) * Number(stats.bsize);
    diskFreeBytes = Number(stats.bavail) * Number(stats.bsize);
  } catch {
    diskTotalBytes = null;
    diskFreeBytes = null;
  }

  let device = null;
  try {
    device = await getDeviceInfo();
  } catch {
    device = null;
  }

  const commit = await getBuildCommit();

  res.json({
    service: "RISECARE Kiosk API",
    version: appVersion,
    commit,
    environment: process.env.NODE_ENV ?? "development",
    nodeVersion: process.version,
    platform: os.platform(),
    architecture: os.arch(),
    hostname: os.hostname(),
    processUptimeSeconds: Math.round(process.uptime()),
    systemUptimeSeconds: Math.round(os.uptime()),
    startedAt: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    memory: {
      processRssBytes: memory.rss,
      heapUsedBytes: memory.heapUsed,
      systemTotalBytes: os.totalmem(),
      systemFreeBytes: os.freemem(),
    },
    storage: {
      databaseBytes,
      diskTotalBytes,
      diskFreeBytes,
    },
    device: device
      ? {
          deviceUid: device.deviceUid,
          kioskId: device.kioskId,
          kioskName: device.kioskName,
          kioskSite: device.kioskSite,
          activated: device.activated,
          createdAt: device.createdAt,
          syncState: device.syncState,
        }
      : null,
  });
});

// Export filtered logs as a plain-text file. Must be declared before "/logs"
// so the more specific path is not shadowed by the list handler.
router.get("/logs/export", requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const filter = buildLogFilter(req.query as Record<string, unknown>);
    const logs = await query(
      `SELECT id, level, component, message, details, created_at
       FROM system_logs ${filter.whereSql}
       ORDER BY id ASC
       LIMIT 5000`,
      filter.params,
    );

    const lines = [
      "RISECARE Health Kiosk - System Logs",
      `Exported: ${new Date().toISOString()}`,
      `Retention: ${systemLogRetention.days} days (max ${systemLogRetention.maxEntries} entries)`,
      `Filters: level=${filter.level || "all"}, component=${filter.component || "all"}, search=${filter.search || "none"}, from=${filter.from || "any"}, to=${filter.to || "any"}`,
      "Timestamps are UTC. Patient health information is never recorded in these logs.",
      "",
    ];

    for (const row of logs) {
      lines.push(
        `${row.created_at} | ${row.level} | ${row.component} | ${row.message}`,
      );
      if (row.details) {
        lines.push(`    ${String(row.details).replace(/\r?\n/g, " ")}`);
      }
    }

    const stamp = new Date()
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\..+$/, "")
      .replace("T", "-");

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="risecare-system-logs-${stamp}.txt"`,
    );
    res.send(`${lines.join("\n")}\n`);

    void logSystem("INFO", "API", "System logs exported", {
      rows: logs.length,
      level: filter.level || "all",
      component: filter.component || "all",
      from: filter.from || "any",
      to: filter.to || "any",
    });
    void logActivity(
      req.user?.id ?? null,
      "System Logs Exported",
      `User ${req.user?.username ?? "Unknown"} exported ${logs.length} system log entr${logs.length === 1 ? "y" : "ies"}`,
    );
  } catch {
    res.status(500).json({ error: "Failed to export system logs" });
  }
});

router.get("/logs", requireAuth, requireSuperadmin, async (req, res) => {
  try {
    const filter = buildLogFilter(req.query as Record<string, unknown>);

    const parsedLimit = Number.parseInt(String(req.query.limit ?? "100"), 10);
    const parsedOffset = Number.parseInt(String(req.query.offset ?? "0"), 10);
    const limit = Math.min(
      Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 100, 1),
      500,
    );
    const offset = Math.max(
      Number.isFinite(parsedOffset) ? parsedOffset : 0,
      0,
    );

    const countRows = await query(
      `SELECT COUNT(*) AS count FROM system_logs ${filter.whereSql}`,
      filter.params,
    );
    const total = Number(countRows[0]?.count ?? 0);

    const logs = await query(
      `SELECT id, level, component, message, details, created_at
       FROM system_logs ${filter.whereSql}
       ORDER BY id DESC
       LIMIT ? OFFSET ?`,
      [...filter.params, limit, offset],
    );

    const componentRows = await query(
      "SELECT DISTINCT component FROM system_logs ORDER BY component ASC",
    );

    res.json({
      logs,
      total,
      limit,
      offset,
      components: componentRows.map((row) => row.component),
      retention: systemLogRetention,
    });
  } catch {
    res.status(500).json({ error: "Failed to load system logs" });
  }
});

export default router;
