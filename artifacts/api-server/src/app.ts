import express, { type Express } from "express";
import cors from "cors";
import crypto from "crypto";
import session from "express-session";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import router from "./routes";

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
  console.warn(
    "⚠️  SESSION_SECRET not set. Using a random secret (sessions invalidate on restart). Set SESSION_SECRET in .env for persistent sessions.",
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
