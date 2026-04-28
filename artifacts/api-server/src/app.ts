import express, { type Express } from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";

const app: Express = express();

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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
