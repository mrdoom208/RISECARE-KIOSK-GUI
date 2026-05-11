import "dotenv/config";
import dotenv from "dotenv";
import { resolve } from "path";
dotenv.config({ path: resolve("../../.env") });
import app from "./app";
import { connectMQTT, disconnectMQTT } from "./mqtt";

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

app.listen(port, async () => {
  console.log(`Server listening on port ${port}`);

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
