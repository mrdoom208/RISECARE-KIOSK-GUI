import express, { type Express } from "express";
import cors from "cors";
import crypto from "crypto";
import session from "express-session";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./logger";
import { logSystem } from "./system-log";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Resolve the session secret from SESSION_SECRET env var or the workspace root .env.
// (Read directly from disk because app.ts is evaluated before the late dotenv.config in index.ts.)
function loadSessionSecret(): string {
  const fromEnv = process.env.SESSION_SECRET;
  if (fromEnv) return fromEnv;

  let currentDir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.resolve(currentDir, "pnpm-workspace.yaml"))) {
      const envPath = path.resolve(currentDir, ".env");
      if (fs.existsSync(envPath)) {
        const content = fs.readFileSync(envPath, "utf-8");
        const match = content.match(/^SESSION_SECRET=(.+)$/m);
        if (match) return match[1].trim();
      }
      break;
    }
    const parent = path.resolve(currentDir, "..");
    if (parent === currentDir) break;
    currentDir = parent;
  }

  const secret = crypto.randomBytes(32).toString("hex");
  logger.warn(
    "Session",
    "SESSION_SECRET is not configured. Using a temporary secret; admin sessions will be invalidated on restart.",
    { action: "Set SESSION_SECRET in .env to keep sessions across restarts." },
  );
  return secret;
}

const SESSION_SECRET = loadSessionSecret();

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "true",
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);

// DEBUG-level API diagnostics. Only the method, path, status and duration are
// recorded: never query strings, request bodies, headers or response bodies.
// These are written only when SYSTEM_LOG_DEBUG=1.
app.use("/api", (req, res, next) => {
  const startedAt = Date.now();
  res.on("finish", () => {
    // Mask numeric resource IDs (for example /api/sessions/42) so debug logs
    // never persist record identifiers that could be linked back to a patient.
    const safePath = req.path
      .replace(/\/\d+/g, "/:id")
      .replace(
        /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
        "/:id",
      );
    void logSystem("DEBUG", "API", `${req.method} ${safePath} ${res.statusCode}`, {
      durationMs: Date.now() - startedAt,
    });
  });
  next();
});

app.use("/api", router);

// Serve the built kiosk frontend in production (single-port mode)
if (
  process.env.NODE_ENV === "production" ||
  process.env.SERVE_STATIC === "true"
) {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const staticPath = path.resolve(
    __dirname,
    "..",
    "..",
    "risecare-kiosk",
    "dist",
    "public",
  );

  app.use(express.static(staticPath));

  // Catch-all: send index.html for any non-API route (React router)
  app.use((_req, res, next) => {
    // Skip API routes
    if (_req.path.startsWith("/api")) {
      return next();
    }
    const indexPath = path.join(staticPath, "index.html");
    res.sendFile(indexPath);
  });
}

export default app;
