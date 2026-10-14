import "dotenv/config";
import dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve("../../.env") });
import app from "./app";
import { connectMQTT, disconnectMQTT } from "./mqtt";
import { startSyncLoop } from "./device";
import { setupWebSocket } from "./ws";

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
  console.log(`Server listening on http://${host}:${port}`);

  // Attach WebSocket server
  setupWebSocket(server);

  // Background offline-first sync (runs only when the kiosk is activated)
  startSyncLoop();

  // Connect to MQTT broker (skip if NO_MQTT=1)
  if (process.env.NO_MQTT !== "1") {
    connectMQTT();
  } else {
    console.log("⚠️ MQTT disabled (NO_MQTT=1)");
  }
});

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("\n Shutting down...");
  disconnectMQTT();
  process.exit(0);
});
