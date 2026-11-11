import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowLeft, Loader2, CheckCircle2, XCircle, HeartPulse, Ruler, Scale, Thermometer, RefreshCw, Printer, Activity, ChevronDown, Fingerprint } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Progress } from "@/components/ui/progress";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useRateLimit } from "@/hooks/use-rate-limit";
import { useSensorWebSocket } from "@/hooks/use-sensor-websocket";
import { ModalShell } from "@/components/ModalShell";
import InstructionModal from "@/components/InstructionModal";
import { sensorGuides } from "@/data/sensorGuides";
import type { SensorGuide } from "@/types/sensorGuide";
import { fetchSensorSettings, normalizeSensorSettings, persistSensorSettings } from "@/lib/sensor-settings";
import { Z_INDEX } from "@/lib/z-index";

interface SensorsSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

const sensors = [
  { id: "bp", name: "Blood Pressure", icon: Activity, unit: "mmHg", key: "systolic", decimals: 0, canCalibrate: false },
  { id: "heartrate", name: "Heart Rate & SpO2", icon: HeartPulse, unit: "bpm", key: "bpm", decimals: 0, canCalibrate: false },
  { id: "height", name: "Height", icon: Ruler, unit: "cm", key: "cm", decimals: 1, canCalibrate: true },
  { id: "weight", name: "Weight", icon: Scale, unit: "kg", key: "kg", decimals: 2, canCalibrate: true },
  { id: "temperature", name: "Temperature", icon: Thermometer, unit: "°C", key: "celsius", decimals: 1, canCalibrate: false },
];

// Dashboard-style instruction cards: each settings sensor maps to the guide
// shown on the Dashboard before a reading starts.
const guideFor = (name: string) => sensorGuides.find((g) => g.name === name);
const sensorGuidesById: Record<string, SensorGuide | undefined> = {
  bp: guideFor("Blood Pressure Cuff"),
  heartrate: guideFor("Pulse Oximeter Sensor"),
  height: guideFor("Height Measurement Sensor"),
  weight: guideFor("Body Weight Scale"),
  temperature: guideFor("Thermometer"),
};

// Hints shown in the reading modal while a test runs, mirroring the live
// reading messages used on the Dashboard.
const testPendingHints: Record<string, string> = {
  bp: "Keep your arm still while the cuff measures and releases pressure...",
  heartrate: "Keep your finger still on the sensor while the reading is being measured...",
  height: "Stand straight under the sensor and remain still...",
  weight: "Step onto the center of the platform and stand still...",
  temperature: "Position your forehead in front of the sensor...",
};

type Feedback = {
  type: "test" | "calibrate";
  status: "pending" | "success" | "fail";
  message: string;
  value?: string;
};

// Fallback sessionId used until the dedicated test session is fetched. The
// API server recognizes this token and never saves its readings either.
const TEST_SESSION_TOKEN = "sensor-test";
const CAL_TIMEOUT = 20000;
const HEIGHT_CAL_TIMEOUT = 45000;
const RATE_LIMIT_MS = 2000;

export function SensorsSettings({ isOpen, onClose }: SensorsSettingsProps) {
  const { toast } = useToast();
  const { isRateLimited: isGloballyRateLimited } = useRateLimit(1000);
  const [enabledSensors, setEnabledSensors] = useState<Record<string, boolean>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [printFeedback, setPrintFeedback] = useState<Feedback | null>(null);
  const [doneCooldown, setDoneCooldown] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, Feedback | null>>({});
  const [refreshing, setRefreshing] = useState(false);
  const [bpAdvancedOpen, setBpAdvancedOpen] = useState(false);
  const [bpRatios, setBpRatios] = useState({ systolic: 0.45, diastolic: 0.85 });
  const [tempAdvancedOpen, setTempAdvancedOpen] = useState(false);
  const [temperatureOffset, setTemperatureOffset] = useState(3.4);
  const [weightAdvancedOpen, setWeightAdvancedOpen] = useState(false);
  // Default per-kg matches the HX711 counts-per-kg constant (loadcell.py);
  // the query below replaces it with the saved value.
  const [weightCalibration, setWeightCalibration] = useState({ offsetRaw: 0, perKgRaw: 28205 });
  const [heightAdvancedOpen, setHeightAdvancedOpen] = useState(false);
  const [heightOffset, setHeightOffset] = useState(0);
  // Dashboard-style test flow: the instruction modal opens first, then the
  // live reading modal tracks the test while it runs.
  const [instructionSensor, setInstructionSensor] = useState<string | null>(null);
  const [readingSensor, setReadingSensor] = useState<string | null>(null);
  const [liveReading, setLiveReading] = useState<Record<string, any>>({});
  const calTimestamps = useRef<Record<string, number>>({});
  const feedbackTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAction = useRef<Record<string, number>>({});
  const readingSensorRef = useRef<string | null>(null);
  readingSensorRef.current = readingSensor;
  // Short rolling window for the live cuff-pressure display only, like the
  // Dashboard reading modal.
  const bpPressureSamplesRef = useRef<number[]>([]);
  const isRateLimited = (sensorId: string) => {
    const last = lastAction.current[sensorId];
    return last != null && Date.now() - last < RATE_LIMIT_MS;
  };

  // Live sensor data pushed over WebSocket while the reading modal is open,
  // exactly like the Dashboard's reading display.
  useSensorWebSocket({
    onSensorReading: useCallback((sensor: string, data: any) => {
      if (readingSensorRef.current !== sensor) return;

      let displayData = data;
      if (sensor === "bp") {
        const pressure = Number(data.pressure);
        if (data.status !== "running") {
          bpPressureSamplesRef.current = [];
        } else if (Number.isFinite(pressure)) {
          const samples = [...bpPressureSamplesRef.current, pressure].slice(-3);
          bpPressureSamplesRef.current = samples;
          const sorted = [...samples].sort((a, b) => a - b);
          displayData = { ...data, displayPressure: sorted[Math.floor(sorted.length / 2)] };
        }
      }

      setLiveReading((prev) => {
        const previous = prev[sensor] ?? {};
        const next = { ...previous, ...displayData, _receivedAt: Date.now() };
        // The finger left the sensor, or the driver rejected the reading:
        // drop the measurement so the modal asks for a finger again instead
        // of showing a stale number.
        if (data.fingerDetected === false || data.hrValid === false) {
          delete next.bpm;
          next.hrValid = false;
        }
        if (data.fingerDetected === false || data.spo2Valid === false) {
          delete next.spo2;
          next.spo2Valid = false;
        }
        return { ...prev, [sensor]: next };
      });
    }, []),
  });

  const hasPending = Object.values(feedback).some((f) => f?.status === "pending");

  const { data: savedBpRatios } = useQuery({
    queryKey: ["bp-ratios"],
    queryFn: async () => {
      const res = await fetch("/api/sensors/bp-ratios");
      if (!res.ok) throw new Error("Failed to load BP calibration settings");
      const data = await res.json();
      return data.bpRatios as { systolic: number; diastolic: number };
    },
    enabled: isOpen,
  });

  useEffect(() => {
    if (savedBpRatios) setBpRatios(savedBpRatios);
  }, [savedBpRatios]);

  const { data: savedTemperatureOffset } = useQuery({
    queryKey: ["temperature-offset"],
    queryFn: async () => {
      const res = await fetch("/api/sensors/temperature-offset");
      if (!res.ok) throw new Error("Failed to load temperature offset");
      const data = await res.json();
      return data.temperatureOffset as number;
    },
    enabled: isOpen,
  });

  useEffect(() => {
    if (typeof savedTemperatureOffset === "number") setTemperatureOffset(savedTemperatureOffset);
  }, [savedTemperatureOffset]);

  const { data: savedWeightCalibration } = useQuery({
    queryKey: ["weight-calibration"],
    queryFn: async () => {
      const res = await fetch("/api/sensors/weight-calibration");
      if (!res.ok) throw new Error("Failed to load weight calibration");
      return await res.json() as { offsetRaw: number | null; perKgRaw: number };
    },
    enabled: isOpen,
  });

  useEffect(() => {
    if (savedWeightCalibration) {
      setWeightCalibration({
        offsetRaw: savedWeightCalibration.offsetRaw ?? 0,
        perKgRaw: savedWeightCalibration.perKgRaw,
      });
    }
  }, [savedWeightCalibration]);

  const { data: savedHeightOffset } = useQuery({
    queryKey: ["height-offset"],
    queryFn: async () => {
      const res = await fetch("/api/sensors/height-offset");
      if (!res.ok) throw new Error("Failed to load height offset");
      return await res.json() as { heightOffset: number };
    },
    enabled: isOpen,
  });

  useEffect(() => {
    if (typeof savedHeightOffset?.heightOffset === "number") {
      setHeightOffset(savedHeightOffset.heightOffset);
    }
  }, [savedHeightOffset]);

  const saveBpRatiosMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sensors/bp-ratios", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bpRatios }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save BP calibration settings");
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "BP ratios saved",
        description: data.hardwareSynced
          ? "New ratios will be used for the next measurement."
          : "Saved on the kiosk and will sync to the sensor device when it reconnects.",
      });
    },
    onError: (error) => {
      toast({ title: "Settings not saved", description: error.message, variant: "destructive" });
    },
  });

  const saveTemperatureOffsetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sensors/temperature-offset", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ temperatureOffset }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save temperature offset");
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Temperature offset saved",
        description: data.hardwareSynced
          ? "New offset will be used for the next measurement."
          : "Saved on the kiosk and will sync to the sensor device when it reconnects.",
      });
    },
    onError: (error) => {
      toast({ title: "Settings not saved", description: error.message, variant: "destructive" });
    },
  });

  const saveWeightCalibrationMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sensors/weight-calibration", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weightCalibration }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save weight calibration");
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Weight calibration saved",
        description: data.hardwareSynced
          ? "New values will be used for the next measurement."
          : "Saved on the kiosk and will sync to the sensor device when it reconnects.",
      });
    },
    onError: (error) => {
      toast({ title: "Settings not saved", description: error.message, variant: "destructive" });
    },
  });

  const saveHeightOffsetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sensors/height-offset", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ heightOffset }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Failed to save height offset");
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: "Height offset saved",
        description: data.hardwareSynced
          ? "New offset will be used for the next measurement."
          : "Saved on the kiosk and will sync to the sensor device when it reconnects.",
      });
    },
    onError: (error) => {
      toast({ title: "Settings not saved", description: error.message, variant: "destructive" });
    },
  });

  useEffect(() => {
    return () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const load = async () => {
      let local = normalizeSensorSettings({});
      try {
        const saved = localStorage.getItem("enabledSensors");
        if (saved) local = normalizeSensorSettings(JSON.parse(saved));
      } catch { /* Use the persisted device settings. */ }
      try {
        const persisted = await fetchSensorSettings();
        if (!active) return;
        const next = persisted ?? local;
        setEnabledSensors(next);
        localStorage.setItem("enabledSensors", JSON.stringify(next));
        if (!persisted) await persistSensorSettings(next);
      } catch {
        if (active) setEnabledSensors(local);
      }
    };
    void load();
    return () => { active = false; };
  }, []);

  const saveEnabledState = (state: Record<string, boolean>) => {
    const next = normalizeSensorSettings(state);
    localStorage.setItem("enabledSensors", JSON.stringify(next));
    setEnabledSensors(next);
    window.dispatchEvent(new Event("sensorStateChange"));
    void persistSensorSettings(next).catch(() => {
      toast({ title: "Settings not saved", description: "Could not save sensor settings to the device.", variant: "destructive" });
    });
  };

  const {
    data: sensorStatus,
    isLoading: statusLoading,
    refetch,
  } = useQuery({
    queryKey: ["sensor-status"],
    queryFn: async () => {
      const res = await fetch("/api/sensors/status");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isOpen,
    // Poll faster right after a refresh: the device publishes once for the
    // cheap I2C checks and again a few seconds later once GPIO/USB probes land.
    refetchInterval: isOpen ? (refreshing ? 1500 : 5000) : false,
  });



  // Single dedicated test session from the server: one row, created once and
  // reused for every test. The API server never saves its readings, so test
  // measurements stay display-only and never touch patient data.
  const { data: testSession } = useQuery({
    queryKey: ["sensor-test-session"],
    queryFn: async () => {
      const res = await fetch("/api/sensors/test-session");
      if (!res.ok) throw new Error("Failed");
      return (await res.json()) as { sessionId: number };
    },
    enabled: isOpen,
  });
  const sessionId = testSession?.sessionId != null ? String(testSession.sessionId) : TEST_SESSION_TOKEN;

  const { data: calibrationResults } = useQuery({
    queryKey: ["calibration-results"],
    queryFn: async () => {
      const res = await fetch("/api/sensors/calibration");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isOpen,
    refetchInterval: hasPending ? 2000 : false,
  });

  const { data: calibrationProgress } = useQuery({
    queryKey: ["calibration-progress"],
    queryFn: async () => {
      const res = await fetch("/api/sensors/calibration-progress");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isOpen && hasPending,
    refetchInterval: hasPending ? 500 : false,
  });
  const calibrationProgressRef = useRef(calibrationProgress);
  calibrationProgressRef.current = calibrationProgress;

  const commandMutation = useMutation({
    mutationFn: async ({
      sensor,
      value,
    }: {
      sensor: string;
      value: number;
    }) => {
      const res = await fetch("/api/sensors/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sensor, value }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onError: (_error, variables) => {
      if (variables.value === 12) {
        setDoneCooldown((prev) => ({ ...prev, [variables.sensor]: false }));
      }
      if (variables.value === 0 && (variables.sensor === "height" || variables.sensor === "weight")) {
        setSensorFeedback(variables.sensor, {
          type: "calibrate",
          status: "pending",
          message: "Could not cancel calibration. It is still running.",
        });
      }
      toast({
        title: "Error",
        description: "Failed to send command",
        variant: "destructive",
      });
    },
  });

  const refreshMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sensors/refresh", { method: "POST" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      setRefreshing(true);
      refetch();
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => setRefreshing(false), 8000);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to ask the sensors to re-probe",
        variant: "destructive",
      });
    },
  });

  const clearFeedbackAfter = (sensorId: string, delay = 4000) => {
    if (feedbackTimers.current[sensorId]) clearTimeout(feedbackTimers.current[sensorId]);
    feedbackTimers.current[sensorId] = setTimeout(() => {
      setFeedback((prev) => ({ ...prev, [sensorId]: null }));
    }, delay);
  };

  const setSensorFeedback = (sensorId: string, fb: Feedback) => {
    setFeedback((prev) => ({ ...prev, [sensorId]: fb }));
  };

  // Independent timeout checker — ticks every second, never depends on query data
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      setFeedback((prev) => {
        let changed = false;
        const next = { ...prev };
        for (const sensorId of Object.keys(next)) {
          const fb = next[sensorId];
          if (!fb || fb.status !== "pending") continue;

          if (fb.type === "calibrate") {
            const started = calTimestamps.current[sensorId];
            const heightReady = sensorId === "height" &&
              calibrationProgressRef.current?.height?._receivedAt > started &&
              calibrationProgressRef.current?.height?.message?.startsWith("Height measured");
            if (heightReady) continue;
            const timeout = sensorId === "height" ? HEIGHT_CAL_TIMEOUT : CAL_TIMEOUT;
            if (now - started > timeout) {
              next[sensorId] = { type: "calibrate", status: "fail", message: "Calibration timed out" };
              changed = true;
            }
          }
        }
        return changed ? next : prev;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Schedule auto-clear for timed-out feedbacks
  useEffect(() => {
    for (const sensorId of Object.keys(feedback)) {
      const fb = feedback[sensorId];
      if (!fb || fb.status !== "fail") continue;
      const delay = fb.type === "calibrate" ? 12000 : 4000;
      clearFeedbackAfter(sensorId, delay);
    }
  }, [feedback]);

  // Check calibration results
  useEffect(() => {
    for (const sensorId of Object.keys(feedback)) {
      const fb = feedback[sensorId];
      if (fb?.type !== "calibrate" || fb.status !== "pending") continue;

      const started = calTimestamps.current[sensorId];
      const result = calibrationResults?.[sensorId];
      if (result && result._receivedAt > started) {
        const sensorName = sensors.find((s) => s.id === sensorId)?.name ?? sensorId;
        if (result.status === "ok") {
          const isHeight = sensorId === "height";
          const value = isHeight
            ? `${Number(result.totalHeight).toFixed(2)} cm`
            : `${Number(result.offset).toFixed(0)}`;
          const message = isHeight
            ? `Saved height calibration ${value}`
            : `Saved weight calibration offset ${value}`;
          setSensorFeedback(sensorId, {
            type: "calibrate",
            status: "success",
            message,
          });
          toast({
            title: "Calibration saved",
            description: message,
          });
        } else if (result.status === "cancelled") {
          setSensorFeedback(sensorId, {
            type: "calibrate",
            status: "success",
            message: "Calibration cancelled",
          });
        } else {
          setSensorFeedback(sensorId, {
            type: "calibrate",
            status: "fail",
            message: "Calibration failed",
          });
          toast({
            title: "Calibration failed",
            description: `${sensorName} did not finish calibration.`,
            variant: "destructive",
          });
        }
      }
    }
  }, [calibrationResults, feedback]);

  const handleTest = (sensorId: string) => {
    if (isRateLimited(sensorId)) return;
    lastAction.current[sensorId] = Date.now();
    // Show the Dashboard instruction card first; Start begins a live
    // measurement (value 1) exactly like the Dashboard.
    setInstructionSensor(sensorId);
  };

  // Starts a real measurement under the dedicated test session — the same
  // command the Dashboard sends. The server never saves these readings.
  const startSensorTest = async (sensorId: string) => {
    try {
      const res = await fetch("/api/sensors/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sensor: sensorId, value: 1 }),
      });
      if (!res.ok) throw new Error("Failed to start sensor");
    } catch {
      toast({ title: "Sensor error", description: "Failed to start sensor reading", variant: "destructive" });
      return;
    }
    // Reset the live state so the modal only shows this test's data.
    setLiveReading((prev) => {
      const next = { ...prev };
      delete next[sensorId];
      return next;
    });
    bpPressureSamplesRef.current = [];
    setInstructionSensor(null);
    setReadingSensor(sensorId);
  };

  // Stops the live measurement (value 0) and closes the reading modal — the
  // Dashboard's Done/Cancel path.
  const finishTestReading = async () => {
    const sensorId = readingSensor;
    setReadingSensor(null);
    if (!sensorId) return;
    try {
      const res = await fetch("/api/sensors/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sensor: sensorId, value: 0 }),
      });
      if (!res.ok) throw new Error("Failed to stop sensor");
    } catch {
      toast({ title: "Sensor error", description: "Failed to stop sensor", variant: "destructive" });
    }
  };

  const handleCalibrate = (sensorId: string) => {
    if (isRateLimited(sensorId)) return;
    lastAction.current[sensorId] = Date.now();
    setDoneCooldown((prev) => ({ ...prev, [sensorId]: false }));
    calTimestamps.current[sensorId] = Date.now();
    const isWeight = sensorId === "weight";
    setSensorFeedback(sensorId, {
      type: "calibrate",
      status: "pending",
      message: isWeight ? "Zeroing scale. Leave the platform empty..." : "Measuring height...",
    });
    commandMutation.mutate({
      sensor: sensorId,
      value: 2,
    });
  };

  const handleFinalizeCalibrate = (sensorId: string) => {
    if (doneCooldown[sensorId]) return;
    if (isRateLimited(sensorId + "_finalize")) return;
    lastAction.current[sensorId + "_finalize"] = Date.now();
    setDoneCooldown((prev) => ({ ...prev, [sensorId]: true }));
    commandMutation.mutate({
      sensor: sensorId,
      value: 12,
    });
  };

  const isWaitingForHeight =
    feedback["height"]?.type === "calibrate" &&
    feedback["height"]?.status === "pending" &&
    calibrationProgress?.height?._receivedAt > calTimestamps.current["height"] &&
    calibrationProgress?.height?.message?.startsWith("Height measured");

  const handleCancelCalibration = (sensorId: string) => {
    if (isRateLimited(sensorId + "_cancel_calibration")) return;
    setDoneCooldown((prev) => ({ ...prev, [sensorId]: false }));
    commandMutation.mutate({ sensor: sensorId, value: 0 });
    setSensorFeedback(sensorId, {
      type: "calibrate",
      status: "success",
      message: "Calibration cancelled",
    });
  };

  const resetMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/sensors/calibration/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Calibration reset", description: "All calibration data cleared." });
      setConfirmReset(false);
      refetch();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reset calibration", variant: "destructive" });
    },
  });

  const toggleSensor = (sensorId: string, enabled?: boolean) => {
    const newState = { ...enabledSensors };
    const enable = enabled ?? !newState[sensorId];
    if (sensorId === "heartrate") {
      newState["heartrate"] = enable;
      newState["spo2"] = enable;
    } else {
      newState[sensorId] = enable;
    }
    saveEnabledState(newState);
  };

  // Missing or stale availability responses mean the sensors were not detected.
  const availabilityStale = sensorStatus?.sensorsStale === true;
  const availabilityUnavailableLabel = "Not detected";

  const printerStatus = sensorStatus?.sensors?.printer as
    | { connected?: boolean; paper?: boolean; paperStatus?: string }
    | undefined;
  const printTestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/print/test", { method: "POST" });
      if (!res.ok) throw new Error("Print test failed");
      return res.json();
    },
    onSuccess: () => {
      setPrintFeedback({ type: "test", status: "success", message: "Test page sent to printer" });
      toast({ title: "Print test sent", description: "Test page sent to printer" });
      clearPrintFeedback();
    },
    onError: () => {
      setPrintFeedback({ type: "test", status: "fail", message: "Print test failed — printer unreachable" });
      toast({ title: "Print test failed", description: "Could not connect to printer", variant: "destructive" });
      clearPrintFeedback();
    },
  });

  const clearPrintFeedback = () => {
    if (feedbackTimers.current["printer"]) clearTimeout(feedbackTimers.current["printer"]);
    feedbackTimers.current["printer"] = setTimeout(() => setPrintFeedback(null), 4000);
  };

  // Dashboard-style reading modal shown while a sensor test runs. It displays
  // the same live WebSocket data as the Dashboard's reading modal; nothing is
  // ever saved — the readings belong to the dedicated test session.
  const renderTestReading = () => {
    if (!readingSensor) return null;
    const sensor = sensors.find((s) => s.id === readingSensor);
    if (!sensor) return null;
    const live = liveReading[readingSensor];
    const isHeartRate = readingSensor === "heartrate";
    const hrLive = isHeartRate ? live : null;
    const fingerPresent = hrLive?.fingerDetected === true;
    const liveRaw = !isHeartRate && readingSensor !== "bp" ? live?.[sensor.key] : null;
    const liveValue = liveRaw != null && Number(liveRaw) > 0 ? Number(liveRaw) : null;

    // Blood pressure mirrors the Dashboard: staged progress while the cuff
    // runs, then the final SYS/DIA and pulse.
    const bpReading = readingSensor === "bp" ? live : null;
    const bpStage = String(bpReading?.stage ?? "");
    const cuffPulseRate = Number(bpReading?.pulseRate);
    const bpCurrentPressure = Number(bpReading?.displayPressure ?? bpReading?.pressure);
    const bpIsRunning = bpReading?.status === "running";
    const hasBpCurrentPressure = Number.isFinite(bpCurrentPressure) && bpCurrentPressure > 0;
    const bpComplete = bpReading?.status === "success" &&
      Number.isFinite(Number(bpReading?.systolic)) && Number.isFinite(Number(bpReading?.diastolic)) &&
      Number.isFinite(cuffPulseRate) && cuffPulseRate > 0 && cuffPulseRate <= 300;
    const bpFailed = bpReading?.status === "failed" || bpReading?.status === "invalid";
    const bpOverallProgress = Math.max(0, Math.min(100, Number(bpReading?.progress) || 0));
    const bpStageLabel =
      bpStage === "starting"
        ? "Preparing cuff..."
        : bpStage === "inflating"
          ? "Inflating cuff..."
          : bpStage === "settling"
            ? "Cuff inflated; settling..."
            : bpStage === "deflating"
              ? "Releasing cuff pressure..."
              : "Measuring cuff pressure...";

    return (
      <>
        <h2 className="text-2xl font-bold mb-6 text-center">{sensor.name}</h2>

        {readingSensor === "bp" ? (
          <>
            {bpIsRunning && (
              <div className="mb-6 space-y-4" aria-live="polite">
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-center">
                  <p className="font-semibold text-amber-800">Experimental measurement</p>
                  <p className="mt-1 text-sm text-amber-800/90">Not for diagnosis or treatment decisions.</p>
                </div>
                <div className="rounded-2xl border border-border/60 bg-secondary/40 p-4">
                  <p className="text-center text-base font-semibold text-foreground">{bpStageLabel}</p>
                  <div className="mt-3 flex justify-between text-sm text-muted-foreground">
                    <span>Measurement progress</span>
                    <span>{Math.round(bpOverallProgress)}%</span>
                  </div>
                  <Progress value={bpOverallProgress} aria-label="Blood pressure measurement progress" className="mt-2" />
                </div>
              </div>
            )}

            <div className="text-center mb-8">
              <div className={`font-bold font-display text-primary mb-2 ${bpIsRunning || bpComplete || bpFailed ? "text-6xl" : "text-4xl"}`}>
                {bpIsRunning ? (
                  hasBpCurrentPressure ? bpCurrentPressure.toFixed(0) : "—"
                ) : bpComplete ? (
                  `${Number(bpReading?.systolic).toFixed(0)}/${Number(bpReading?.diastolic).toFixed(0)}`
                ) : bpFailed ? (
                  "Invalid"
                ) : (
                  <span role="status" aria-label="Measuring blood pressure" className="inline-flex items-center justify-center">
                    <Loader2 className="w-10 h-10 animate-spin" />
                  </span>
                )}
              </div>
              <div className="text-xl text-muted-foreground">{bpFailed ? "" : "mmHg"}</div>
            </div>

            {bpComplete && (
              <p className="text-center text-lg font-semibold mb-6">Pulse: {cuffPulseRate.toFixed(0)} bpm</p>
            )}

            {bpFailed && (
              <div role="alert" className="mb-6 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-center">
                <p className="text-lg font-bold text-destructive">Invalid BP result</p>
                <p className="mt-1 text-sm text-foreground">
                  {bpReading?.error || "The cuff could not calculate a valid SYS/DIA reading."}
                </p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Reposition the cuff, keep your arm still, and try again.
                </p>
              </div>
            )}

            <p className="text-center text-muted-foreground mb-6">
              {bpComplete
                ? "Measurement complete. Press Done to continue."
                : bpIsRunning
                  ? "Keep your arm still while the cuff measures and releases pressure..."
                  : "Waiting for the cuff to start..."}
            </p>
          </>
        ) : isHeartRate ? (
          fingerPresent ? (
            <>
              <div className="flex items-center justify-center gap-6 mb-6">
                <div className="text-center">
                  <div className={`font-bold font-display text-primary mb-1 ${hrLive?.bpm != null ? "text-5xl" : "text-3xl"}`}>
                    {hrLive?.bpm != null ? Number(hrLive.bpm).toFixed(0) : (
                      <span role="status" aria-label="Measuring heart rate" className="inline-flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin" />
                      </span>
                    )}
                  </div>
                  <div className="text-base text-muted-foreground">bpm</div>
                  <div className="text-sm text-muted-foreground/70 mt-1">Heart Rate</div>
                </div>
                <div className="text-4xl text-muted-foreground/30 font-light">|</div>
                <div className="text-center">
                  <div className={`font-bold font-display text-primary mb-1 ${hrLive?.spo2 != null ? "text-5xl" : "text-3xl"}`}>
                    {hrLive?.spo2 != null ? Number(hrLive.spo2).toFixed(0) : (
                      <span role="status" aria-label="Measuring oxygen saturation" className="inline-flex items-center justify-center">
                        <Loader2 className="w-8 h-8 animate-spin" />
                      </span>
                    )}
                  </div>
                  <div className="text-base text-muted-foreground">%</div>
                  <div className="text-sm text-muted-foreground/70 mt-1">SpO2</div>
                </div>
              </div>
              <div className="mb-6 space-y-2" aria-live="polite">
                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>Collecting sensor samples</span>
                  <span>{typeof hrLive?.sampleProgress === "number" ? `${Math.round(hrLive.sampleProgress)}%` : "—"}</span>
                </div>
                <Progress
                  value={typeof hrLive?.sampleProgress === "number" ? Math.round(hrLive.sampleProgress) : 0}
                  aria-label="Heart rate and oxygen saturation sample progress"
                />
              </div>
              <p className="text-center text-muted-foreground mb-6">
                Keep your finger still on the sensor while the reading is being measured...
              </p>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center text-center py-6 mb-6">
              <div className="w-24 h-24 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mb-5">
                <Fingerprint className="w-12 h-12 text-primary" />
              </div>
              <p className="text-3xl font-display font-bold text-foreground mb-2">
                Please insert your finger
              </p>
              <p className="text-lg text-muted-foreground max-w-xs">
                {hrLive == null
                  ? "Waiting for the pulse oximeter sensor to report..."
                  : "Place your finger on the pulse oximeter sensor to start measuring."}
              </p>
            </div>
          )
        ) : (
          <>
            <div className="text-center mb-8">
              <div className={`font-bold font-display text-primary mb-2 ${liveValue != null ? "text-6xl" : "text-4xl"}`}>
                {liveValue != null ? liveValue.toFixed(sensor.decimals) : (
                  <span role="status" aria-label={`Measuring ${sensor.name.toLowerCase()}`} className="inline-flex items-center justify-center">
                    <Loader2 className="w-10 h-10 animate-spin" />
                  </span>
                )}
              </div>
              {liveValue != null && <div className="text-xl text-muted-foreground">{sensor.unit}</div>}
            </div>
            <p className="text-center text-muted-foreground mb-6">
              {testPendingHints[readingSensor] ?? "Waiting for the sensor..."}
            </p>
          </>
        )}

        <div className="flex gap-4">
          {readingSensor === "bp" && bpIsRunning ? (
            <button
              onClick={() => void finishTestReading()}
              className="flex-1 px-6 py-4 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 font-semibold text-lg"
            >
              Stop
            </button>
          ) : (
            <>
              <button
                onClick={() => void finishTestReading()}
                className="flex-1 px-6 py-4 bg-gray-200 rounded-lg hover:bg-gray-300 font-semibold text-lg"
              >
                Cancel
              </button>
              <button
                onClick={() => void finishTestReading()}
                className="flex-1 px-6 py-4 bg-primary text-white rounded-lg hover:bg-primary-dark font-semibold text-lg"
              >
                Done
              </button>
            </>
          )}
        </div>
      </>
    );
  };

  return (
    <>
      <ModalShell
        open={isOpen}
        zIndex={Z_INDEX.SETTINGS_NESTED}
        backdrop="scrim"
        panelClassName="bg-card rounded-3xl shadow-2xl p-5 sm:p-6 md:p-10 w-full max-w-5xl border border-border/50 max-h-[90vh] overflow-y-auto"
      >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 mb-8">
              <div className="flex items-center gap-3">
                <button
                  onClick={onClose}
                  className="p-3 rounded-full hover:bg-muted transition-colors"
                  aria-label="Close sensors"
                >
                  <ArrowLeft className="w-7 h-7" />
                </button>
                <h2 className="text-3xl font-bold">Sensors</h2>
              </div>
              <div className="flex items-center gap-2 px-4 py-2.5 rounded-full border border-border/60 bg-secondary/50 shrink-0">
                {statusLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                ) : (
                  <span
                    className={`w-3 h-3 rounded-full ${sensorStatus?.connected ? "bg-green-500" : "bg-red-500"}`}
                  />
                )}
                <span
                  className={`text-base font-medium ${sensorStatus?.connected ? "text-green-600" : "text-red-600"}`}
                >
                  {sensorStatus?.connected ? "MQTT Connected" : "MQTT Disconnected"}
                </span>
              </div>
            </div>

            {/* Sensor grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {sensors.map((sensor) => {
                const fb = feedback[sensor.id];
                const SensorIcon = sensor.icon;
                const progress = calibrationProgress?.[sensor.id];
                const progressMessage =
                  fb?.type === "calibrate" &&
                  fb.status === "pending" &&
                  progress?._receivedAt > calTimestamps.current[sensor.id]
                    ? progress.message
                    : null;
                const feedbackMessage = progressMessage ?? fb?.message;
                const availabilityId = sensor.id === "heartrate" ? "max30102" : sensor.id;
                const detected = sensorStatus?.sensors?.[availabilityId];
                const sensorUnavailable = availabilityStale || detected === false;
                const calibrationSaved =
                  (sensor.id === "height" || sensor.id === "weight") &&
                  calibrationResults?.[sensor.id]?.status === "ok" &&
                  !fb;

                return (
                  <div
                    key={sensor.id}
                    className="bg-card border border-border/60 rounded-2xl p-5 shadow-sm flex flex-col gap-4"
                  >
                    {/* Card header */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-12 h-12 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                          <SensorIcon className="w-6 h-6" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-lg font-semibold leading-tight truncate">{sensor.name}</h3>
                          <p className="text-sm text-muted-foreground">{sensor.unit}</p>
                        </div>
                      </div>
                      {availabilityStale ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 px-3 py-1.5 text-sm text-muted-foreground border-border/60"
                        >
                          {availabilityUnavailableLabel}
                        </Badge>
                      ) : detected === false ? (
                        <Badge variant="destructive" className="shrink-0 px-3 py-1.5 text-sm">
                          Not detected
                        </Badge>
                      ) : detected === true ? (
                        <Badge
                          variant="outline"
                          className="shrink-0 px-3 py-1.5 text-sm text-green-600 border-green-500/30 bg-green-500/10"
                        >
                          Detected
                        </Badge>
                      ) : null}
                    </div>

                    <div className="h-px bg-border/60" />

                    {/* Enable toggle */}
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-background/40 px-4 py-3">
                      <button
                        type="button"
                        onClick={() => {
                          if (isGloballyRateLimited("toggle-" + sensor.id)) return;
                          toggleSensor(sensor.id);
                        }}
                        className="flex-1 min-w-0 text-left disabled:opacity-50"
                      >
                        <p className="text-base font-medium">Sensor enabled</p>
                        {sensorUnavailable && enabledSensors[sensor.id] && (
                          <p className="text-sm text-muted-foreground truncate">Will resume when the sensor is detected</p>
                        )}
                        {calibrationSaved && (
                          <p className="text-sm text-muted-foreground truncate">
                            {sensor.id === "height"
                              ? `Calibrated ${calibrationResults.height.totalHeight?.toFixed(1)} cm`
                              : `Offset ${Number(calibrationResults.weight.offset).toFixed(0)}`}
                          </p>
                        )}
                      </button>
                      <Switch
                        checked={!!enabledSensors[sensor.id]}
                        onCheckedChange={(checked) => {
                          if (isGloballyRateLimited("toggle-" + sensor.id)) return;
                          toggleSensor(sensor.id, checked === true);
                        }}
                        className="h-8 w-[52px] shrink-0 [&>span]:h-6! [&>span]:w-6! [&>span]:data-[state=checked]:translate-x-6! [&>span]:data-[state=unchecked]:translate-x-0!"
                      />
                    </div>

                    {sensor.id === "bp" && (
                      <div className="rounded-xl border border-border/50 bg-background/40 p-4">
                        <button
                          type="button"
                          onClick={() => setBpAdvancedOpen((value) => !value)}
                          className="flex w-full items-center justify-between gap-3 text-left"
                          aria-expanded={bpAdvancedOpen}
                        >
                          <span className="text-base font-semibold">Advanced calibration</span>
                          <ChevronDown className={`h-5 w-5 transition-transform ${bpAdvancedOpen ? "rotate-180" : ""}`} />
                        </button>
                        {bpAdvancedOpen && (
                          <div className="mt-4 space-y-4">
                            <p className="text-sm text-muted-foreground">
                              Set the SYS and DIA envelope ratios as percentages of the pulse amplitude peak. These experimental values can affect readings; adjust only against a trusted reference.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <label className="space-y-1.5">
                                <span className="text-sm font-medium">SYS ratio (%)</span>
                                <input
                                  type="number"
                                  min="20"
                                  max="70"
                                  step="1"
                                  value={Math.round(bpRatios.systolic * 100)}
                                  onChange={(event) => setBpRatios((current) => ({ ...current, systolic: Number(event.target.value) / 100 }))}
                                  className="h-12 w-full rounded-lg border border-input bg-background px-3 text-base"
                                />
                              </label>
                              <label className="space-y-1.5">
                                <span className="text-sm font-medium">DIA ratio (%)</span>
                                <input
                                  type="number"
                                  min="60"
                                  max="100"
                                  step="1"
                                  value={Math.round(bpRatios.diastolic * 100)}
                                  onChange={(event) => setBpRatios((current) => ({ ...current, diastolic: Number(event.target.value) / 100 }))}
                                  className="h-12 w-full rounded-lg border border-input bg-background px-3 text-base"
                                />
                              </label>
                            </div>
                            {bpRatios.systolic >= bpRatios.diastolic && (
                              <p className="text-sm text-destructive">SYS ratio must be lower than DIA ratio.</p>
                            )}
                            <Button
                              onClick={() => saveBpRatiosMutation.mutate()}
                              disabled={
                                saveBpRatiosMutation.isPending ||
                                !Number.isFinite(bpRatios.systolic) ||
                                !Number.isFinite(bpRatios.diastolic) ||
                                bpRatios.systolic < 0.2 || bpRatios.systolic > 0.7 ||
                                bpRatios.diastolic < 0.6 || bpRatios.diastolic > 1 ||
                                bpRatios.systolic >= bpRatios.diastolic
                              }
                              variant="outline"
                              size="lg"
                              className="h-12 w-full text-base"
                            >
                              {saveBpRatiosMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                              Save BP ratios
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {sensor.id === "temperature" && (
                      <div className="rounded-xl border border-border/50 bg-background/40 p-4">
                        <button
                          type="button"
                          onClick={() => setTempAdvancedOpen((value) => !value)}
                          className="flex w-full items-center justify-between gap-3 text-left"
                          aria-expanded={tempAdvancedOpen}
                        >
                          <span className="text-base font-semibold">Advanced calibration</span>
                          <ChevronDown className={`h-5 w-5 transition-transform ${tempAdvancedOpen ? "rotate-180" : ""}`} />
                        </button>
                        {tempAdvancedOpen && (
                          <div className="mt-4 space-y-4">
                            <p className="text-sm text-muted-foreground">
                              Fixed value added to the infrared skin temperature reading. Adjust only against a trusted reference thermometer.
                            </p>
                            <label className="block space-y-1.5">
                              <span className="text-sm font-medium">Temperature offset (°C)</span>
                              <input
                                type="number"
                                min="-20"
                                max="20"
                                step="0.1"
                                value={temperatureOffset}
                                onChange={(event) => setTemperatureOffset(Number(event.target.value))}
                                className="h-12 w-full rounded-lg border border-input bg-background px-3 text-base"
                              />
                            </label>
                            {(!Number.isFinite(temperatureOffset) ||
                              temperatureOffset < -20 ||
                              temperatureOffset > 20) && (
                              <p className="text-sm text-destructive">Offset must be between -20 and 20 °C.</p>
                            )}
                            <Button
                              onClick={() => saveTemperatureOffsetMutation.mutate()}
                              disabled={
                                saveTemperatureOffsetMutation.isPending ||
                                !Number.isFinite(temperatureOffset) ||
                                temperatureOffset < -20 ||
                                temperatureOffset > 20
                              }
                              variant="outline"
                              size="lg"
                              className="h-12 w-full text-base"
                            >
                              {saveTemperatureOffsetMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                              Save temperature offset
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {sensor.id === "weight" && (
                      <div className="rounded-xl border border-border/50 bg-background/40 p-4">
                        <button
                          type="button"
                          onClick={() => setWeightAdvancedOpen((value) => !value)}
                          className="flex w-full items-center justify-between gap-3 text-left"
                          aria-expanded={weightAdvancedOpen}
                        >
                          <span className="text-base font-semibold">Advanced calibration</span>
                          <ChevronDown className={`h-5 w-5 transition-transform ${weightAdvancedOpen ? "rotate-180" : ""}`} />
                        </button>
                        {weightAdvancedOpen && (
                          <div className="mt-4 space-y-4">
                            <p className="text-sm text-muted-foreground">
                              Raw scale values: weight = (raw − offset) ÷ per kg. The offset is the reading with an empty
                              platform; per kg is the raw counts one kilogram adds. Adjust only against a trusted reference
                              scale. Taring from this page replaces these values on the device.
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <label className="space-y-1.5">
                                <span className="text-sm font-medium">Offset (raw counts)</span>
                                <input
                                  type="number"
                                  min="-8388608"
                                  max="8388607"
                                  step="1"
                                  value={weightCalibration.offsetRaw}
                                  onChange={(event) => setWeightCalibration((current) => ({ ...current, offsetRaw: Number(event.target.value) }))}
                                  className="h-12 w-full rounded-lg border border-input bg-background px-3 text-base"
                                />
                              </label>
                              <label className="space-y-1.5">
                                <span className="text-sm font-medium">Per kg (raw counts)</span>
                                <input
                                  type="number"
                                  min="1"
                                  max="10000000"
                                  step="1"
                                  value={weightCalibration.perKgRaw}
                                  onChange={(event) => setWeightCalibration((current) => ({ ...current, perKgRaw: Number(event.target.value) }))}
                                  className="h-12 w-full rounded-lg border border-input bg-background px-3 text-base"
                                />
                              </label>
                            </div>
                            {(!Number.isFinite(weightCalibration.offsetRaw) ||
                              !Number.isFinite(weightCalibration.perKgRaw) ||
                              weightCalibration.offsetRaw < -8388608 ||
                              weightCalibration.offsetRaw > 8388607 ||
                              weightCalibration.perKgRaw < 1 ||
                              weightCalibration.perKgRaw > 10000000) && (
                              <p className="text-sm text-destructive">
                                Offset must be between -8388608 and 8388607, and per kg between 1 and 10000000 (raw counts).
                              </p>
                            )}
                            <Button
                              onClick={() => saveWeightCalibrationMutation.mutate()}
                              disabled={
                                saveWeightCalibrationMutation.isPending ||
                                !Number.isFinite(weightCalibration.offsetRaw) ||
                                !Number.isFinite(weightCalibration.perKgRaw) ||
                                weightCalibration.offsetRaw < -8388608 ||
                                weightCalibration.offsetRaw > 8388607 ||
                                weightCalibration.perKgRaw < 1 ||
                                weightCalibration.perKgRaw > 10000000
                              }
                              variant="outline"
                              size="lg"
                              className="h-12 w-full text-base"
                            >
                              {saveWeightCalibrationMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                              Save weight calibration
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {sensor.id === "height" && (
                      <div className="rounded-xl border border-border/50 bg-background/40 p-4">
                        <button
                          type="button"
                          onClick={() => setHeightAdvancedOpen((value) => !value)}
                          className="flex w-full items-center justify-between gap-3 text-left"
                          aria-expanded={heightAdvancedOpen}
                        >
                          <span className="text-base font-semibold">Advanced calibration</span>
                          <ChevronDown className={`h-5 w-5 transition-transform ${heightAdvancedOpen ? "rotate-180" : ""}`} />
                        </button>
                        {heightAdvancedOpen && (
                          <div className="mt-4 space-y-4">
                            <p className="text-sm text-muted-foreground">
                              Fixed value added to every measured height. Adjust only against a trusted reference.
                            </p>
                            <label className="block space-y-1.5">
                              <span className="text-sm font-medium">Height offset (cm)</span>
                              <input
                                type="number"
                                min="-50"
                                max="50"
                                step="0.1"
                                value={heightOffset}
                                onChange={(event) => setHeightOffset(Number(event.target.value))}
                                className="h-12 w-full rounded-lg border border-input bg-background px-3 text-base"
                              />
                            </label>
                            {(!Number.isFinite(heightOffset) || heightOffset < -50 || heightOffset > 50) && (
                              <p className="text-sm text-destructive">Offset must be between -50 and 50 cm.</p>
                            )}
                            <Button
                              onClick={() => saveHeightOffsetMutation.mutate()}
                              disabled={
                                saveHeightOffsetMutation.isPending ||
                                !Number.isFinite(heightOffset) ||
                                heightOffset < -50 ||
                                heightOffset > 50
                              }
                              variant="outline"
                              size="lg"
                              className="h-12 w-full text-base"
                            >
                              {saveHeightOffsetMutation.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
                              Save height offset
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Feedback */}
                    {fb && (
                      <div
                        className={`p-4 rounded-xl border ${
                          fb.status === "pending"
                            ? "bg-blue-500/10 border-blue-500/30"
                            : fb.status === "success"
                              ? "bg-green-500/10 border-green-500/30"
                              : "bg-red-500/10 border-red-500/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            {fb.status === "pending" && <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0" />}
                            {fb.status === "success" && <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />}
                            {fb.status === "fail" && <XCircle className="w-5 h-5 text-red-500 shrink-0" />}
                            <span
                              className={`text-base font-medium truncate ${
                                fb.status === "pending"
                                  ? "text-blue-600"
                                  : fb.status === "success"
                                    ? "text-green-600"
                                    : "text-red-600"
                              }`}
                            >
                              {feedbackMessage}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {fb.value && (
                              <span className="text-2xl font-bold text-primary">{fb.value}</span>
                            )}
                            {fb.status === "pending" && fb.type === "calibrate" && (
                              <span className="text-sm text-muted-foreground">
                                timeout {sensor.id === "height" ? "45s" : "20s"}
                              </span>
                            )}
                          </div>
                        </div>
                        {sensor.id === "height" && isWaitingForHeight && (
                          <Button
                            onClick={() => handleFinalizeCalibrate("height")}
                            disabled={commandMutation.isPending || doneCooldown["height"]}
                            className="mt-3 w-full h-12 text-base"
                            size="lg"
                          >
                            Done — height measured
                          </Button>
                        )}
                        {(sensor.id === "height" || sensor.id === "weight") &&
                          fb.status === "pending" && fb.type === "calibrate" && !isWaitingForHeight && (
                            <Button
                              onClick={() => handleCancelCalibration(sensor.id)}
                              disabled={commandMutation.isPending}
                              variant="outline"
                              className="mt-3 w-full h-12 text-base"
                              size="lg"
                            >
                              Cancel calibration
                            </Button>
                          )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 mt-auto">
                      {sensor.canCalibrate && (
                        <Button
                          onClick={() => handleCalibrate(sensor.id)}
                          disabled={
                            commandMutation.isPending ||
                            !sensorStatus?.connected ||
                            sensorUnavailable ||
                            !enabledSensors[sensor.id] ||
                            fb?.status === "pending" ||
                            isRateLimited(sensor.id)
                          }
                          variant="outline"
                          size="lg"
                          className="flex-1 h-12 text-base"
                        >
                          Calibrate
                        </Button>
                      )}
                      <Button
                        onClick={() => handleTest(sensor.id)}
                        disabled={
                          commandMutation.isPending ||
                          !sensorStatus?.connected ||
                          sensorUnavailable ||
                          !enabledSensors[sensor.id] ||
                          fb?.status === "pending" ||
                          isRateLimited(sensor.id)
                        }
                        variant="secondary"
                        size="lg"
                        className={sensor.canCalibrate ? "flex-1 h-12 text-base" : "w-full h-12 text-base"}
                      >
                        Test
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Printer card */}
            <div className="mt-5 bg-card border border-border/60 rounded-2xl p-5 shadow-sm flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 shrink-0 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                    <Printer className="w-6 h-6" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold leading-tight truncate">Thermal Printer</h3>
                    <p className="text-sm text-muted-foreground">USB · 80mm receipt</p>
                  </div>
                </div>
                {availabilityStale ? (
                  <Badge
                    variant="outline"
                    className="shrink-0 px-3 py-1.5 text-sm text-muted-foreground border-border/60"
                  >
                    {availabilityUnavailableLabel}
                  </Badge>
                ) : !printerStatus?.connected ? (
                  <Badge variant="destructive" className="shrink-0 px-3 py-1.5 text-sm">
                    Not detected
                  </Badge>
                ) : printerStatus?.paperStatus === "unknown" ? (
                  <Badge
                    variant="outline"
                    className="shrink-0 px-3 py-1.5 text-sm text-muted-foreground border-border/60"
                  >
                    Paper status unavailable
                  </Badge>
                ) : printerStatus?.paperStatus === "low" ? (
                  <Badge
                    variant="outline"
                    className="shrink-0 px-3 py-1.5 text-sm text-amber-600 border-amber-500/30 bg-amber-500/10"
                  >
                    Paper low
                  </Badge>
                ) : printerStatus?.paper ? (
                  <Badge
                    variant="outline"
                    className="shrink-0 px-3 py-1.5 text-sm text-green-600 border-green-500/30 bg-green-500/10"
                  >
                    Paper OK
                  </Badge>
                ) : (
                  <Badge variant="destructive" className="shrink-0 px-3 py-1.5 text-sm">
                    No paper inside
                  </Badge>
                )}
              </div>

              <div className="h-px bg-border/60" />

              <div className="flex items-center justify-between gap-3 rounded-xl border border-border/40 bg-background/40 px-4 py-3">
                <button
                  type="button"
                  onClick={() => {
                    if (isGloballyRateLimited("toggle-printer")) return;
                    toggleSensor("printer");
                  }}
                  className="flex-1 min-w-0 text-left disabled:opacity-50"
                >
                  <p className="text-base font-medium">Printer enabled</p>
                  {(!printerStatus?.connected || !printerStatus?.paper || availabilityStale) && enabledSensors["printer"] && (
                    <p className="text-sm text-muted-foreground truncate">Printing will resume when the printer and paper are detected</p>
                  )}
                  {!enabledSensors["printer"] && (
                    <p className="text-sm text-muted-foreground truncate">Printing will be skipped</p>
                  )}
                </button>
                <Switch
                  checked={!!enabledSensors["printer"]}
                  onCheckedChange={(checked) => {
                    if (isGloballyRateLimited("toggle-printer")) return;
                    toggleSensor("printer", checked === true);
                  }}
                  className="h-8 w-[52px] shrink-0 [&>span]:h-6! [&>span]:w-6! [&>span]:data-[state=checked]:translate-x-6! [&>span]:data-[state=unchecked]:translate-x-0!"
                />
              </div>

              {printFeedback && (
                <div
                  className={`p-4 rounded-xl border ${
                    printFeedback.status === "pending"
                      ? "bg-blue-500/10 border-blue-500/30"
                      : printFeedback.status === "success"
                        ? "bg-green-500/10 border-green-500/30"
                        : "bg-red-500/10 border-red-500/30"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      {printFeedback.status === "pending" && <Loader2 className="w-5 h-5 text-blue-500 animate-spin shrink-0" />}
                      {printFeedback.status === "success" && <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />}
                      {printFeedback.status === "fail" && <XCircle className="w-5 h-5 text-red-500 shrink-0" />}
                      <span
                        className={`text-base font-medium truncate ${
                          printFeedback.status === "pending"
                            ? "text-blue-600"
                            : printFeedback.status === "success"
                              ? "text-green-600"
                              : "text-red-600"
                        }`}
                      >
                        {printFeedback.message}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 mt-auto">
                <Button
                  onClick={() => { if (isGloballyRateLimited("print-test")) return; printTestMutation.mutate(); }}
                  disabled={
                    printTestMutation.isPending ||
                    !sensorStatus?.connected ||
                    availabilityStale ||
                    !printerStatus?.connected ||
                    !printerStatus?.paper ||
                    !enabledSensors["printer"]
                  }
                  variant="secondary"
                  size="lg"
                  className="w-full h-12 text-base"
                >
                  {printTestMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <Printer className="w-5 h-5" />
                  )}
                  Print Test
                </Button>
              </div>
            </div>

            {/* Footer actions */}
            <div className="mt-8 flex flex-col sm:flex-row gap-3">
              <Button
                onClick={() => {
                  if (isGloballyRateLimited("refresh")) return;
                  refreshMutation.mutate();
                }}
                disabled={refreshMutation.isPending || refreshing}
                variant="outline"
                size="lg"
                className="sm:flex-1 h-12 text-base"
              >
                <RefreshCw
                  className={`w-5 h-5 ${
                    refreshMutation.isPending || refreshing ? "animate-spin" : ""
                  }`}
                />
                {refreshing ? "Re-probing sensors…" : "Refresh Status"}
              </Button>
            </div>

            {/* Reset calibration */}
            <div className="mt-5 pt-4 border-t border-border/50">
              {confirmReset ? (
                <div className="flex gap-3">
                  <Button
                    onClick={() => { if (isGloballyRateLimited("reset-cancel")) return; setConfirmReset(false); }}
                    variant="outline"
                    className="flex-1 h-11 text-base"
                    size="lg"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={() => { if (isGloballyRateLimited("reset-confirm")) return; resetMutation.mutate(); }}
                    variant="destructive"
                    className="flex-1 h-11 text-base"
                    size="lg"
                    disabled={resetMutation.isPending}
                  >
                    {resetMutation.isPending ? "Resetting..." : "Confirm Reset"}
                  </Button>
                </div>
              ) : (
                <Button
                  onClick={() => { if (isGloballyRateLimited("reset-all")) return; setConfirmReset(true); }}
                  variant="ghost"
                  size="lg"
                  className="w-full h-11 text-base text-muted-foreground hover:text-destructive"
                >
                  Reset All Calibration
                </Button>
              )}
            </div>
      </ModalShell>

      {/* Dashboard-style test flow: instruction card first, then the live
          reading modal that tracks the test result. */}
      <InstructionModal
        isOpen={instructionSensor !== null}
        onClose={() => setInstructionSensor(null)}
        onStart={() => {
          if (!instructionSensor) return;
          void startSensorTest(instructionSensor);
        }}
        sensorGuide={instructionSensor != null ? sensorGuidesById[instructionSensor] : undefined}
        zIndex={Z_INDEX.SETTINGS_NESTED_2}
      />

      <ModalShell
        open={readingSensor !== null}
        zIndex={Z_INDEX.SETTINGS_NESTED_2}
        backdrop="blur"
        panelClassName="bg-card rounded-3xl shadow-2xl p-8 w-full max-w-md border border-border/50"
      >
        {renderTestReading()}
      </ModalShell>
    </>
  );
}
