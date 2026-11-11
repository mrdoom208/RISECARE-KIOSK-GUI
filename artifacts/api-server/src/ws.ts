import { WebSocketServer, WebSocket } from "ws";
import type { Server } from "http";
import { logger } from "./logger";
import { subscribe } from "./mqtt";

let wss: WebSocketServer | null = null;

interface SensorMessage {
  type: "sensor_reading" | "sensor_availability" | "calibration_progress" | "command_ack";
  sensor: string;
  data: any;
  receivedAt: number;
}

function broadcast(msg: SensorMessage) {
  if (!wss) return;
  const payload = JSON.stringify(msg);
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

export function setupWebSocket(server: Server) {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws) => {
    logger.debug("WebSocket", "Client connected");

    ws.on("close", () => {
      logger.debug("WebSocket", "Client disconnected");
    });
  });

  // Bridge MQTT sensor topics → WebSocket
  const sensorTopics: [string, string][] = [
    ["risecare/sensors/bp", "bp"],
    ["risecare/sensors/vitals", "heartrate"],
    ["risecare/sensors/temperature", "temperature"],
    ["risecare/sensors/weight", "weight"],
    ["risecare/sensors/height", "height"],
  ];

  for (const [topic, sensor] of sensorTopics) {
    subscribe(topic, (data) => {
      broadcast({ type: "sensor_reading", sensor, data, receivedAt: Date.now() });
    });
  }

  subscribe("risecare/sensors/availability", (data) => {
    broadcast({ type: "sensor_availability", sensor: "all", data, receivedAt: Date.now() });
  });

  subscribe("risecare/calibration/progress/+", (data, topic) => {
    const sensor = topic?.split("/").pop() || "unknown";
    broadcast({ type: "calibration_progress", sensor, data, receivedAt: Date.now() });
  });

  logger.info("WebSocket", "WebSocket server ready", { path: "/ws" });
  return wss;
}
