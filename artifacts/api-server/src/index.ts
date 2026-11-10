import "./quiet-logs";
import "dotenv/config";
import dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve("../../.env") });
import app from "./app";
import { connectMQTT, disconnectMQTT } from "./mqtt";
import { startHeartbeatLoop, startSyncLoop } from "./device";
import { setupWebSocket } from "./ws";
import { logger } from "./logger";
import { logSystem, pruneSystemLogs } from "./system-log";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Bind to loopback by default so dev/start is not exposed on the LAN.
// Containers override this with HOST=0.0.0.0 and rely on their port mapping
// (127.0.0.1:5000:5000) to keep the service off the network.
const host = process.env["HOST"] ?? "127.0.0.1";

const server = app.listen(port, host, async () => {
  logger.info("Backend", "API server listening", { host, port });

  void pruneSystemLogs();
  void logSystem("INFO", "Backend", "Backend started successfully", {
    port,
    host,
    environment: process.env.NODE_ENV ?? "development",
    version: process.env.APP_VERSION ?? "0.0.0",
  });
  void logSystem("INFO", "Database", "Database connection verified");

  // Attach WebSocket server
  setupWebSocket(server);

  // Background offline-first sync (runs only when the kiosk is activated)
  startSyncLoop();

  // Presence heartbeat every 5 minutes so the portal reports this kiosk online
  startHeartbeatLoop();

  // Connect to MQTT broker (skip if NO_MQTT=1)
  if (process.env.NO_MQTT !== "1") {
    connectMQTT();
  } else {
    logger.warn("Backend", "MQTT integration is disabled", { reason: "NO_MQTT=1" });
    void logSystem("WARNING", "Backend", "MQTT disabled (NO_MQTT=1)");
  }
});

// Graceful shutdown
process.on("SIGINT", () => {
  logger.info("Backend", "Shutting down gracefully");
  disconnectMQTT();
  process.exit(0);
});
