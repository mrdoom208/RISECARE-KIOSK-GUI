import mqtt from "mqtt";
import crypto from "crypto";
import { logger } from "./logger";
import { logSystem } from "./system-log";

const MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://localhost:1883";
const MQTT_TOPIC = process.env.MQTT_TOPIC || "risecare/#";
const MQTT_DEBUG = process.env.MQTT_DEBUG === "1";

// Sensor topics publish continuously. Printing every payload is noisy and can
// expose measurement data in the console, so raw traffic is opt-in.
function mqttDebug(...args: unknown[]): void {
  if (MQTT_DEBUG) logger.debug("MQTT", "Raw broker traffic", { values: args });
}

type MessageHandler = (payload: any, topic?: string) => void;

let client: mqtt.MqttClient | null = null;
let messageHandlers: Map<string, MessageHandler[]> = new Map();
const connectedHandlers = new Set<() => void>();

// While the broker is down the client retries forever. Logging every retry
// would rotate useful entries out of the 2,000-row system log in under an hour,
// so failures are summarized at most once per interval.
const MQTT_LOG_THROTTLE_MS = 10 * 60 * 1000;

let reconnectAttempts = 0;
let disconnectedSince = 0;
let lastFailureLoggedAt = 0;
let lastError = "";
let connectedOnce = false;
let intentionalDisconnect = false;

function markDisconnected(): void {
  if (!disconnectedSince) disconnectedSince = Date.now();
}

function reportMqttFailure(consoleMessage: string): void {
  markDisconnected();
  const now = Date.now();
  if (now - lastFailureLoggedAt < MQTT_LOG_THROTTLE_MS) return;
  lastFailureLoggedAt = now;
  logger.warn("MQTT", consoleMessage, { broker: MQTT_BROKER, attempts: reconnectAttempts });
  void logSystem(
    "WARNING",
    "Network",
    "MQTT broker unavailable; retrying in background",
    {
      broker: MQTT_BROKER,
      attempts: reconnectAttempts,
      downtimeSeconds: Math.round((now - disconnectedSince) / 1000),
      lastError: lastError || undefined,
    },
  );
}

export function connectMQTT() {
  if (client?.connected) return client;

  intentionalDisconnect = false;
  logger.info("MQTT", "Connecting to broker", { broker: MQTT_BROKER });
  void logSystem("INFO", "Network", "Connecting to MQTT broker", {
    broker: MQTT_BROKER,
  });

  client = mqtt.connect(MQTT_BROKER, {
    clientId: `risecare-api-${Math.random().toString(16).slice(2, 8)}`,
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 5000,
  });

  client.on("connect", () => {
    const attempts = reconnectAttempts;
    const downtimeSeconds = disconnectedSince
      ? Math.round((Date.now() - disconnectedSince) / 1000)
      : 0;
    logger.info(
      "MQTT",
      attempts > 0 ? "Connected to broker after retries" : "Connected to broker",
      { broker: MQTT_BROKER, ...(attempts > 0 ? { attempts } : {}) },
    );
    void logSystem(
      "INFO",
      "Network",
      connectedOnce
        ? "MQTT reconnected"
        : attempts > 0
          ? "MQTT broker connected after retries"
          : "MQTT broker connected",
      {
        broker: MQTT_BROKER,
        ...(attempts > 0 ? { attempts, downtimeSeconds } : {}),
      },
    );
    reconnectAttempts = 0;
    disconnectedSince = 0;
    lastFailureLoggedAt = 0;
    lastError = "";
    connectedOnce = true;

    client?.subscribe(MQTT_TOPIC, { qos: 1 }, (err) => {
      if (err) {
        logger.error("MQTT", "Topic subscription failed", {
          topic: MQTT_TOPIC,
          error: err.message,
        });
        void logSystem("ERROR", "Network", "MQTT subscription failed", {
          topic: MQTT_TOPIC,
          error: err.message,
        });
      } else {
        logger.info("MQTT", "Subscribed to topic", { topic: MQTT_TOPIC });
      }
    });
    connectedHandlers.forEach((handler) => handler());
  });

  client.on("message", (topic, payload) => {
    try {
      const raw = JSON.parse(payload.toString());
      // Enrich sensor payloads with server-side timestamp and unique reading ID
      if (!raw.readingId) {
        raw.readingId = crypto.randomUUID();
      }
      if (!raw.receivedAt) {
        raw.receivedAt = Date.now();
      }
      const data = raw;
      mqttDebug("Received message", { topic, payload: data });

      // Call registered handlers. Handlers are async and write to the DB; a
      // rejected handler must never become an unhandled rejection that kills
      // the whole API mid-session.
      const handlers = messageHandlers.get(topic);
      if (handlers) {
        for (const handler of handlers) {
          void Promise.resolve(handler(data, topic)).catch((error) =>
            logger.error("MQTT", "Message handler failed", {
              topic,
              error: error instanceof Error ? error.message : String(error),
            }),
          );
        }
      }

      // Also call wildcard handlers
      messageHandlers.forEach((fns, pattern) => {
        if (pattern.includes("#") || pattern.includes("+")) {
          const regex = new RegExp(
            "^" + pattern.replace(/\/#$/, "/.*").replace(/\+/, "[^/]+") + "$"
          );
          if (regex.test(topic)) {
            for (const fn of fns) {
              void Promise.resolve(fn(data, topic)).catch((error) =>
                logger.error("MQTT", "Message handler failed", {
                  topic,
                  error: error instanceof Error ? error.message : String(error),
                }),
              );
            }
          }
        }
      });
    } catch (e) {
      logger.warn("MQTT", "Could not parse incoming message", {
        error: e instanceof Error ? e.message : String(e),
      });
      void logSystem("WARNING", "Network", "Failed to parse MQTT message", {
        error: e instanceof Error ? e.message : String(e),
      });
    }
  });

  client.on("error", (err) => {
    lastError = err.message;
    reportMqttFailure(`Connection error: ${err.message}`);
  });

  client.on("close", () => {
    if (intentionalDisconnect) {
      intentionalDisconnect = false;
      return;
    }
    reportMqttFailure("Connection closed");
  });

  client.on("reconnect", () => {
    reconnectAttempts += 1;
    void logSystem("DEBUG", "Network", "MQTT reconnect attempt", {
      broker: MQTT_BROKER,
      attempt: reconnectAttempts,
      lastError: lastError || undefined,
    });
    reportMqttFailure(`Reconnecting (attempt ${reconnectAttempts})`);
  });

  return client;
}

export function onMQTTConnected(handler: () => void) {
  connectedHandlers.add(handler);
  if (client?.connected) handler();
  return () => connectedHandlers.delete(handler);
}

export function disconnectMQTT() {
  if (client) {
    intentionalDisconnect = true;
    client.end();
    client = null;
    reconnectAttempts = 0;
    disconnectedSince = 0;
    lastFailureLoggedAt = 0;
    lastError = "";
    connectedOnce = false;
    logger.info("MQTT", "Disconnected");
    void logSystem("INFO", "Network", "MQTT disconnected");
  }
}

export function publish(topic: string, payload: any, options: { retain?: boolean } = {}): boolean {
  if (!client?.connected) {
    logger.warn("MQTT", "Publish skipped because the broker is not connected", {
      topic,
    });
    void logSystem("WARNING", "Network", "MQTT publish skipped: broker not connected", {
      topic,
    });
    return false;
  }

  const message = JSON.stringify(payload);
  
  // Fire and forget - publish is async
  client.publish(topic, message, { qos: 1, retain: options.retain ?? false }, (err) => {
    if (err) {
      logger.error("MQTT", "Publish failed", {
        topic,
        error: err.message,
      });
      void logSystem("ERROR", "Network", "MQTT publish failed", {
        topic,
        error: err.message,
      });
    }
  });
  
  mqttDebug("Published message", { topic, payload });
  return true;
}

export function subscribe(topic: string, handler: MessageHandler) {
  const handlers = messageHandlers.get(topic);
  if (handlers) {
    handlers.push(handler);
  } else {
    messageHandlers.set(topic, [handler]);
  }
  logger.debug("MQTT", "Registered message handler", { topic });
}

export function isConnected() {
  return client?.connected ?? false;
}
