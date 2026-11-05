import { query, run } from "@workspace/db";
import { logger } from "./logger";

export type SystemLogLevel = "INFO" | "WARNING" | "ERROR" | "DEBUG";

export const SYSTEM_LOG_LEVELS: SystemLogLevel[] = [
  "INFO",
  "WARNING",
  "ERROR",
  "DEBUG",
];

export const SYSTEM_LOG_COMPONENTS = [
  "Backend",
  "Database",
  "Sensor",
  "API",
  "Network",
  "Sync",
  "System",
] as const;

export type SystemLogComponent = (typeof SYSTEM_LOG_COMPONENTS)[number];

function envInt(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}

// Retention is clamped to a safe range so a typo in the environment cannot
// either fill the Raspberry Pi's storage or delete logs almost immediately.
// Getters keep this configurable at runtime: modules load before the workspace
// .env file is applied by the server entry point.
export const systemLogRetention = {
  get days(): number {
    return envInt("SYSTEM_LOG_RETENTION_DAYS", 14, 7, 30);
  },
  get maxEntries(): number {
    return envInt("SYSTEM_LOG_MAX_ENTRIES", 2000, 500, 10000);
  },
};

let debugEnabled: boolean | undefined;

function isDebugEnabled(): boolean {
  if (debugEnabled === undefined) {
    debugEnabled = process.env.SYSTEM_LOG_DEBUG === "1";
  }
  return debugEnabled;
}
const MAX_MESSAGE_LENGTH = 1000;
const MAX_DETAILS_LENGTH = 2000;

// Keys that could contain patient or credential data. Values under these keys
// are replaced before anything is persisted. Callers should still only pass
// operational metadata, never assessment payloads.
const SENSITIVE_KEY =
  /(patient|full_?name|first_?name|last_?name|phone|address|email|ssn|birth|blood|systolic|diastolic|heart|pulse|oxygen|spo2|temperature|weight|height|bmi|token|password|passcode|api[_-]?key|secret|credential)/i;

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4) return "[truncated]";
  if (Array.isArray(value)) {
    return value.slice(0, 20).map((item) => redact(item, depth + 1));
  }
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      result[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : redact(entry, depth + 1);
    }
    return result;
  }
  return value;
}

function serializeDetails(details: unknown): string | null {
  if (details == null) return null;
  if (typeof details === "string") return truncate(details, MAX_DETAILS_LENGTH);
  try {
    return truncate(JSON.stringify(redact(details)), MAX_DETAILS_LENGTH);
  } catch {
    return null;
  }
}

// Writes are serialized so an Express request never races another log insert
// against the single sql.js connection.
let writeChain: Promise<void> = Promise.resolve();

export function logSystem(
  level: SystemLogLevel,
  component: SystemLogComponent,
  message: string,
  details?: unknown,
): Promise<void> {
  if (level === "DEBUG" && !isDebugEnabled()) return Promise.resolve();

  const entry = {
    level,
    component,
    message: truncate(message, MAX_MESSAGE_LENGTH),
    details: serializeDetails(details),
  };

  writeChain = writeChain
    .then(() =>
      run(
        "INSERT INTO system_logs (level, component, message, details) VALUES (?, ?, ?, ?)",
        [entry.level, entry.component, entry.message, entry.details],
      ),
    )
    .then(() => undefined)
    .catch((error) => {
      // Logging must never break the operation that produced the log entry.
      logger.error("System Log", "Could not write a system log entry", error);
    });

  return writeChain;
}

export async function pruneSystemLogs(): Promise<void> {
  try {
    await run("DELETE FROM system_logs WHERE created_at < datetime('now', ?)", [
      `-${systemLogRetention.days} days`,
    ]);
    // Hard cap as a second layer of rotation, independent of wall-clock time.
    await run(
      "DELETE FROM system_logs WHERE id NOT IN (SELECT id FROM system_logs ORDER BY id DESC LIMIT ?)",
      [systemLogRetention.maxEntries],
    );
  } catch (error) {
    logger.error("System Log", "Could not prune expired system log entries", error);
  }
}

export async function getSystemLogCount(): Promise<number> {
  const rows = await query("SELECT COUNT(*) AS count FROM system_logs");
  return Number(rows[0]?.count ?? 0);
}

// The server entry point prunes once at boot (after the workspace .env is
// loaded), then this timer keeps retention enforced while the kiosk runs.
const cleanupTimer = setInterval(() => {
  void pruneSystemLogs();
}, 24 * 60 * 60 * 1000);
cleanupTimer.unref?.();
