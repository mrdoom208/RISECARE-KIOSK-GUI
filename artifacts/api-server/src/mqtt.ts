import mqtt from "mqtt";

const MQTT_BROKER = process.env.MQTT_BROKER || "mqtt://localhost:1883";
const MQTT_TOPIC = process.env.MQTT_TOPIC || "risecare/#";

let client: mqtt.MqttClient | null = null;
let messageHandlers: Map<string, (payload: any, topic?: string) => void> = new Map();

export function connectMQTT() {
  if (client?.connected) return client;

  console.log("Connecting to MQTT broker:", MQTT_BROKER);

  client = mqtt.connect(MQTT_BROKER, {
    clientId: `risecare-api-${Math.random().toString(16).slice(2, 8)}`,
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 5000,
  });

  client.on("connect", () => {
    console.log("✅ MQTT connected");
    client?.subscribe(MQTT_TOPIC, { qos: 1 }, (err) => {
      if (err) {
        console.error("MQTT subscribe error:", err);
      } else {
        console.log(`📡 Subscribed to: ${MQTT_TOPIC}`);
      }
    });
  });

  client.on("message", (topic, payload) => {
    try {
      const data = JSON.parse(payload.toString());
      console.log(`📥 MQTT received [${topic}]:`, data);

      // Call registered handlers
      const handler = messageHandlers.get(topic);
      if (handler) {
        handler(data, topic);
      }

      // Also call wildcard handlers
      messageHandlers.forEach((fn, pattern) => {
        if (pattern.includes("#") || pattern.includes("+")) {
          const regex = new RegExp(
            "^" + pattern.replace(/\/#$/, "/.*").replace(/\+/, "[^/]+") + "$"
          );
          if (regex.test(topic)) {
            fn(data, topic);
          }
        }
      });
    } catch (e) {
      console.error("Failed to parse MQTT message:", e);
    }
  });

  client.on("error", (err) => {
    console.error("❌ MQTT error:", err.message);
  });

  client.on("close", () => {
    console.log("🔌 MQTT disconnected");
  });

  client.on("reconnect", () => {
    console.log("🔄 MQTT reconnecting...");
  });

  return client;
}

export function disconnectMQTT() {
  if (client) {
    client.end();
    client = null;
    console.log("MQTT disconnected");
  }
}

export function publish(topic: string, payload: any): boolean {
  if (!client?.connected) {
    console.warn("⚠️ MQTT not connected, cannot publish");
    return false;
  }

  const message = JSON.stringify(payload);
  
  // Fire and forget - publish is async
  client.publish(topic, message, { qos: 1 }, (err) => {
    if (err) {
      console.error("MQTT publish error:", err);
    }
  });
  
  console.log(`📤 MQTT published [${topic}]:`, payload);
  return true;
}

export function subscribe(
  topic: string,
  handler: (payload: any, topic?: string) => void
) {
  messageHandlers.set(topic, handler);
  console.log(`📡 Registered handler for: ${topic}`);
}

export function isConnected() {
  return client?.connected ?? false;
}

export function getClient() {
  return client;
}
