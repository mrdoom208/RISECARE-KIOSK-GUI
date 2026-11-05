type ConsoleLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

// Console logs are intentionally separate from the persisted system log. This
// helper keeps terminal output consistent and machine-readable:
// 2026-01-01T00:00:00.000Z [ERROR] [Printer] Receipt printing failed | {...}
// Debug output is opt-in so a production kiosk stays quiet by default.

function isDebugEnabled(): boolean {
  return (
    process.env.SYSTEM_LOG_DEBUG === "1" ||
    (process.env.LOG_LEVEL ?? "").trim().toLowerCase() === "debug"
  );
}

function describeDetails(details: unknown): string {
  if (details === undefined || details === null) return "";
  if (details instanceof Error) {
    const stack = details.stack ? `\n${details.stack}` : "";
    return ` | ${details.name}: ${details.message}${stack}`;
  }
  if (typeof details === "string") {
    return details.trim() ? ` | ${details}` : "";
  }
  try {
    return ` | ${JSON.stringify(details)}`;
  } catch {
    return ` | ${String(details)}`;
  }
}

function write(
  level: ConsoleLevel,
  component: string,
  message: string,
  details?: unknown,
): void {
  const line = `${new Date().toISOString()} [${level}] [${component}] ${message}${describeDetails(details)}`;

  if (level === "ERROR") {
    console.error(line);
    return;
  }
  if (level === "WARN") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export const logger = {
  debug(component: string, message: string, details?: unknown): void {
    if (isDebugEnabled()) write("DEBUG", component, message, details);
  },
  info(component: string, message: string, details?: unknown): void {
    write("INFO", component, message, details);
  },
  warn(component: string, message: string, details?: unknown): void {
    write("WARN", component, message, details);
  },
  error(component: string, message: string, details?: unknown): void {
    write("ERROR", component, message, details);
  },
};
