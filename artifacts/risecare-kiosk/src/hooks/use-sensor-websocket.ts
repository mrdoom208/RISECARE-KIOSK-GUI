import { useEffect, useRef, useState, useCallback } from "react";

interface SensorMessage {
  type: "sensor_reading" | "sensor_availability" | "calibration_progress" | "command_ack";
  sensor: string;
  data: any;
  receivedAt: number;
}

interface UseSensorWebSocketOptions {
  onSensorReading?: (sensor: string, data: any, receivedAt: number) => void;
  onAvailability?: (data: any) => void;
  onCalibrationProgress?: (sensor: string, data: any) => void;
}

export function useSensorWebSocket(options: UseSensorWebSocketOptions) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${protocol}//${host}/ws`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("🔌 WebSocket connected");
      setConnected(true);
    };

    ws.onmessage = (event) => {
      try {
        const msg: SensorMessage = JSON.parse(event.data);
        switch (msg.type) {
          case "sensor_reading":
            optionsRef.current.onSensorReading?.(msg.sensor, msg.data, msg.receivedAt);
            break;
          case "sensor_availability":
            optionsRef.current.onAvailability?.(msg.data);
            break;
          case "calibration_progress":
            optionsRef.current.onCalibrationProgress?.(msg.sensor, msg.data);
            break;
        }
      } catch (e) {
        console.error("WebSocket parse error:", e);
      }
    };

    ws.onclose = () => {
      console.log("🔌 WebSocket disconnected");
      setConnected(false);
      wsRef.current = null;
      // Reconnect after 2s
      reconnectTimer.current = setTimeout(connect, 2000);
    };

    ws.onerror = (err) => {
      console.error("WebSocket error:", err);
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  return { connected };
}
