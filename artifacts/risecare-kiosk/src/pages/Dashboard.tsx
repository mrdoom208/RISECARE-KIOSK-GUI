import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { useHistoryState } from "wouter/use-browser-location";
import { useSaveVitals } from "@workspace/api-client-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRateLimit } from "@/hooks/use-rate-limit";
import { useToast } from "@/hooks/use-toast";
import { useSensorWebSocket } from "@/hooks/use-sensor-websocket";
// @ts-ignore - Session type from @workspace/api-zod
type Session = any;
import {
  Heart,
  Activity,
  Droplet,
  Scale,
  Ruler,
  Wind,
  Plus,
  CheckCircle2,
  Lock,
  Thermometer,
  Fingerprint,
} from "lucide-react";
import { getStatusColor, getStatusText, getBPStatus, getHRStatus, getSpO2Status, getTempStatus, getBMIStatus, calculateBMI } from "@/lib/vitals-utils";
import {
  MAX30102_SENSOR_ID,
  getFingerState,
  readValidPulseRate,
  readValidSpo2,
  max30102StabilitySample,
  isSameStableMeasurement,
} from "@/lib/max30102";
import { KioskHeader } from "@/components/KioskHeader";
import { VitalCard } from "@/components/VitalCard";
import InstructionModal from "@/components/InstructionModal";
import { KeypadDialog } from "@/components/KeypadDialog";
import { ModalShell } from "@/components/ModalShell";
import { Progress } from "@/components/ui/progress";
import type { Vitals } from "@/types/vitals";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import NotFound from "./not-found";

import { sensorGuides } from "@/data/sensorGuides";
import { sensorStabilityConfig } from "@/lib/sensor-stability";
import { disableMissingSensors } from "@/lib/sensor-availability";

type VitalType =
  | "bp"
  | "hr"
  | "spo2"
  | "weight"
  | "height"
  | "temperature";

// Map vital types to sensor IDs
const vitalToSensorId: Record<VitalType, string> = {
  bp: "bp",
  hr: "heartrate",
  spo2: "spo2",
  weight: "weight",
  height: "height",
  temperature: "temperature",
};

export default function Dashboard() {
  const { isRateLimited } = useRateLimit(1000);
  const [, setLocation] = useLocation();
  const navState = useHistoryState<{ token?: string }>();
  const sessionToken = navState?.token || "";
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [activeKeypad, setActiveKeypad] = useState<VitalType | null>(null);
  const [activeSensor, setActiveSensor] = useState<
    (typeof sensorGuides)[0] | null
  >(null);
  const [readingVital, setReadingVital] = useState<VitalType | null>(null);
  const [stableCount, setStableCount] = useState(0);
  const prevValueRef = useRef<any>(null);
  // Id of the last payload that was counted towards the stability run, so a
  // measurement is only counted once no matter how often the effect re-runs.
  const countedReadingRef = useRef<string | number | null>(null);
  // Monotonic counter for received payloads. It identifies a payload
  // uniquely, unlike a timestamp, which can repeat within a millisecond.
  const payloadSeqRef = useRef(0);
  // The values that were on screen when the reading was confirmed. Latching
  // them means lifting the finger (or a drifting measurement afterwards)
  // cannot take a finished reading away.
  const [confirmedReading, setConfirmedReading] = useState<{
    heartRate: number | null;
    oxygenSaturation: number | null;
  } | null>(null);
  const readingVitalRef = useRef<VitalType | null>(null);
  // Snapshot timestamp already handled, so the auto-disable effect runs once per
  // availability update instead of again on every poll / state change.
  const lastHandledAvailabilityRef = useRef<number | null>(null);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [enabledSensors, setEnabledSensors] = useState<Record<string, boolean>>({});
  const [liveReadings, setLiveReadings] = useState<Record<string, any>>({});
  readingVitalRef.current = readingVital;

  // WebSocket: receive live sensor data pushed from server
  const { connected: wsConnected } = useSensorWebSocket({
    onSensorReading: useCallback((sensor: string, data: any) => {
      const activeVital = readingVitalRef.current;
      if (!activeVital) return;

      // HR and SpO2 are sent together on the heartrate topic.
      const expectedSensor = activeVital === "hr" || activeVital === "spo2"
        ? "heartrate"
        : vitalToSensorId[activeVital];
      if (sensor !== expectedSensor) return;

      setLiveReadings((prev) => {
        const previous = prev[sensor] ?? {};
        // The MAX30102 publishes every second, with or without a measurement.
        // Merging keeps the last value visible while a status-only payload
        // arrives, so a stable reading is not wiped between ticks.
        const next = {
          ...previous,
          ...data,
          _receivedAt: Date.now(),
          _seq: ++payloadSeqRef.current,
        };

        // The finger left the sensor, or the driver rejected the reading:
        // drop the measurement so the kiosk asks for a finger again instead
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

  // Load enabled state from localStorage
  useEffect(() => {
    const loadEnabledSensors = () => {
      const saved = localStorage.getItem("enabledSensors");
      if (saved) {
        setEnabledSensors(JSON.parse(saved));
      }
    };
    
    loadEnabledSensors();
    
    // Listen for changes from other components
    window.addEventListener("sensorStateChange", loadEnabledSensors);
    return () => window.removeEventListener("sensorStateChange", loadEnabledSensors);
  }, []);

  // Check if a vital's sensor is enabled
  const isVitalEnabled = (vital: VitalType) => {
    const sensorId = vitalToSensorId[vital];
    return enabledSensors[sensorId] || false;
  };

  const { data: sensorStatus } = useQuery({
    queryKey: ["sensor-status"],
    queryFn: async () => {
      const res = await fetch("/api/sensors/status");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const mqttConnected = sensorStatus?.connected ?? false;
  const max30102Available = sensorStatus?.sensors?.max30102;
  const bpAvailable = sensorStatus?.sensors?.bp;
  const availabilityStale = sensorStatus?.sensorsStale === true;

  const isVitalDisabled = (vital: VitalType) => {
    const usesMax30102 = vital === "hr" || vital === "spo2";
    // A stale snapshot can't tell us the chip is missing, so don't lock the
    // operator out of HR/SpO2 based on old data.
    const max30102Missing = !availabilityStale && max30102Available === false;
    const bpMissing = vital === "bp" && !availabilityStale && bpAvailable === false;
    return !mqttConnected || !isVitalEnabled(vital) || (usesMax30102 && max30102Missing) || bpMissing;
  };

  // Auto-disable sensors the device reports as missing so the kiosk never
  // offers a vital whose hardware is absent. Persist + notify other views.
  useEffect(() => {
    const updatedAt = sensorStatus?.sensorsUpdatedAt ?? null;
    if (updatedAt === null || updatedAt === lastHandledAvailabilityRef.current) {
      return;
    }
    lastHandledAvailabilityRef.current = updatedAt;

    const { next, disabled } = disableMissingSensors(
      enabledSensors,
      sensorStatus?.sensors,
      {
        connected: sensorStatus?.connected === true,
        stale: sensorStatus?.sensorsStale === true,
      },
    );

    if (disabled.length === 0) return;

    localStorage.setItem("enabledSensors", JSON.stringify(next));
    setEnabledSensors(next);
    window.dispatchEvent(new Event("sensorStateChange"));
  }, [sensorStatus, enabledSensors]);

  const { data: session, isLoading } = useQuery<Session>({
    queryKey: ["session", sessionToken],
    queryFn: async () => {
      const res = await fetch("/api/sessions/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: sessionToken }),
      });
      if (!res.ok) throw new Error("Session not found");
      return res.json();
    },
    enabled: !!sessionToken,
    refetchInterval: readingVital ? 2000 : false,
  });

  const saveVitalsMutation = useSaveVitals();

  const currentVitals = useMemo<Vitals>(() => {
    if (!session?.vitals) return {};
    return session.vitals.reduce((acc: Vitals, curr: Vitals) => ({ ...acc, ...curr }), {});
  }, [session]);

  const getLiveReadingValue = (vital: VitalType) => {
    const sensorId = vital === "hr" || vital === "spo2"
      ? "heartrate"
      : vitalToSensorId[vital];
    const reading = liveReadings[sensorId];

    if (!reading || String(reading.sessionId) !== String(session?.id)) return null;

    switch (vital) {
      case "bp":
        return reading.systolic != null && reading.diastolic != null
          ? { sys: reading.systolic, dia: reading.diastolic, pulseRate: reading.pulseRate }
          : null;
      case "hr":
        return readValidPulseRate(reading);
      case "spo2":
        return readValidSpo2(reading);
      case "weight":
        return reading.kg && reading.kg > 0 ? reading.kg : null;
      case "height":
        return reading.cm && reading.cm > 0 ? reading.cm : null;
      case "temperature":
        return reading.celsius && reading.celsius > 0 ? reading.celsius : null;
    }
  };

  // MAX30102 state for the finger-on-sensor prompt. A reading only counts
  // when it belongs to the session that is currently being recorded.
  const max30102Reading = useMemo(() => {
    const reading = liveReadings[MAX30102_SENSOR_ID];
    if (!reading || String(reading.sessionId) !== String(session?.id)) return null;
    return reading;
  }, [liveReadings, session?.id]);

  const fingerState = getFingerState(max30102Reading);
  const fingerPresent = fingerState === "present";
  const livePulseRate = readValidPulseRate(max30102Reading);
  const liveOxygenSaturation = readValidSpo2(max30102Reading);

  // How many consecutive settled measurements the sensor needs before the
  // reading is accepted.
  const requiredStableCount =
    (readingVital ? sensorStabilityConfig[vitalToSensorId[readingVital]]?.stableCount : undefined) ?? 5;

  // A reading is confirmed once enough settled measurements have been
  // counted. It stays confirmed even if the finger is lifted afterwards, so
  // the patient can still finish the measurement.
  const bpReading = liveReadings.bp;
  const cuffPulseRate = Number(bpReading?.pulseRate);
  const bpComplete = readingVital === "bp" && bpReading?.status === "success" &&
    Number.isFinite(Number(bpReading.systolic)) && Number.isFinite(Number(bpReading.diastolic)) &&
    Number.isFinite(cuffPulseRate) && cuffPulseRate > 0 && cuffPulseRate <= 300;
  const readingConfirmed = readingVital === "bp"
    ? bpComplete
    : readingVital != null && confirmedReading != null;
  const isStable = readingConfirmed;

  // Values shown in the reading modal: the live measurement while the finger
  // is on the sensor, the stored one once the reading has been confirmed.
  const hrValue = fingerPresent
    ? livePulseRate
    : readingConfirmed
      ? (confirmedReading?.heartRate ?? currentVitals.heartRate ?? null)
      : null;
  const spo2Value = fingerPresent
    ? liveOxygenSaturation
    : readingConfirmed
      ? (confirmedReading?.oxygenSaturation ?? currentVitals.oxygenSaturation ?? null)
      : null;

  useEffect(() => {
    if (!readingVital || !session || readingVital === "bp") {
      setStableCount(0);
      setConfirmedReading(null);
      prevValueRef.current = null;
      countedReadingRef.current = null;
      return;
    }

    const sensorId = vitalToSensorId[readingVital];
    const config = sensorStabilityConfig[sensorId];
    if (!config) return;

    // Only count a payload once, even when the session poll re-runs this
    // effect between two sensor readings.
    const reading = liveReadings[sensorId];
    const readingKey = reading?.readingId ?? reading?._seq ?? null;
    if (readingKey !== null) {
      if (readingKey === countedReadingRef.current) return;
      countedReadingRef.current = readingKey;
    }

    let currentValue: any;
    let prevValue: any = prevValueRef.current;

    switch (readingVital) {
      case "hr":
        // The MAX30102 reports the pulse rate and the SpO2 from the same
        // capture, so the run follows whichever one the driver accepted.
        currentValue = max30102StabilitySample(max30102Reading);
        break;
      case "spo2":
        currentValue = getLiveReadingValue("spo2");
        break;
      case "weight":
        currentValue = getLiveReadingValue("weight") ?? currentVitals.weight;
        break;
      case "height":
        currentValue = getLiveReadingValue("height") ?? currentVitals.height;
        break;
      case "temperature":
        currentValue = getLiveReadingValue("temperature") ?? currentVitals.temperature;
        break;
    }

    if (currentValue == null) {
      // No measurement right now: the finger is off the sensor or the driver
      // rejected the reading. The run is frozen instead of reset, so a
      // reading that was already confirmed stays confirmable.
      return;
    }

    if (prevValue !== null) {
      const isNear =
        readingVital === "hr"
          ? isSameStableMeasurement(prevValue, currentValue)
          : config.compare(prevValue, currentValue);

      if (isNear) {
        setStableCount((prev) => Math.min(prev + 1, config.stableCount));
      } else {
        setStableCount(1);
        prevValueRef.current = currentValue;
        return;
      }
    } else {
      setStableCount(1);
    }

    prevValueRef.current = currentValue;
  }, [liveReadings, readingVital, session]);

  // Once the run has settled, remember the values that were measured so the
  // kiosk can keep showing them after the finger leaves the sensor.
  useEffect(() => {
    if (!readingVital) return;
    if (stableCount < requiredStableCount) return;
    if (confirmedReading) return;
    setConfirmedReading({
      heartRate: livePulseRate ?? currentVitals.heartRate ?? null,
      oxygenSaturation: liveOxygenSaturation ?? currentVitals.oxygenSaturation ?? null,
    });
  }, [readingVital, stableCount, requiredStableCount, confirmedReading, livePulseRate, liveOxygenSaturation, currentVitals]);

  const autoBMI = calculateBMI(currentVitals.weight, currentVitals.height);
  const heightInches = currentVitals.height != null
    ? Math.round(currentVitals.height / 2.54)
    : null;

  const handleSaveVital = (val1: string, val2?: string) => {
    if (!activeKeypad) return;

    const num1 = val1 ? parseFloat(val1) : null;
    const num2 = val2 ? parseFloat(val2) : null;

    const payload: any = {};

    if (activeKeypad === "bp") {
      payload.bloodPressureSystolic = num1;
      payload.bloodPressureDiastolic = num2;
      payload.bloodPressurePulse = null;
    } else if (activeKeypad === "hr") payload.heartRate = num1;
    else if (activeKeypad === "spo2") payload.oxygenSaturation = num1;
    else if (activeKeypad === "weight") payload.weight = num1;
    else if (activeKeypad === "height") payload.height = num1;
    else if (activeKeypad === "temperature") payload.temperature = num1;

    saveVitalsMutation.mutate(
      { id: Number(sessionToken), data: payload },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: ["session", sessionToken],
          });
          setActiveKeypad(null);
        },
      },
    );
  };

const handleStartReading = async () => {
  if (!activeSensor || !activeKeypad || !session?.id) return;

  try {
    const res = await fetch("/api/sensors/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        sensor: vitalToSensorId[activeKeypad],
        value: 1,
      }),
    });
    if (!res.ok) throw new Error("Failed to start sensor");
  } catch (err) {
    console.error("Failed to send start command:", err);
    toast({ title: "Sensor error", description: "Failed to start sensor reading", variant: "destructive" });
    return;
  }

  setLiveReadings({});
  setReadingVital(activeKeypad);
  setActiveSensor(null);
  setStableCount(0);
  setConfirmedReading(null);
  prevValueRef.current = null;
  countedReadingRef.current = null;
};

const stopSensor = async () => {
  if (!readingVital || !session?.id) return;
  try {
    const res = await fetch("/api/sensors/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        sensor: vitalToSensorId[readingVital],
        value: 0,
      }),
    });
    if (!res.ok) throw new Error("Failed to stop sensor");
  } catch (err) {
    console.error("Failed to send stop command:", err);
    toast({ title: "Sensor error", description: "Failed to stop sensor", variant: "destructive" });
  }
  setReadingVital(null);
  setStableCount(0);
  setConfirmedReading(null);
  setLiveReadings({});
  prevValueRef.current = null;
  countedReadingRef.current = null;
};

const handleDoneReading = async () => {
  await stopSensor();
};

const handleCancelReading = async () => {
  if (!session?.id) return;
  const vital = readingVital;
  await stopSensor();

  const clearPayload: Record<string, null> = {};
  if (vital === "hr") {
    clearPayload.heartRate = null;
    clearPayload.oxygenSaturation = null;
  } else if (vital === "spo2") {
    clearPayload.oxygenSaturation = null;
  } else if (vital === "bp") {
    clearPayload.bloodPressureSystolic = null;
    clearPayload.bloodPressureDiastolic = null;
    clearPayload.bloodPressurePulse = null;
  } else if (vital === "weight") {
    clearPayload.weight = null;
  } else if (vital === "height") {
    clearPayload.height = null;
  } else if (vital === "temperature") {
    clearPayload.temperature = null;
  }

  if (Object.keys(clearPayload).length === 0) return;

  try {
    const res = await fetch(`/api/sessions/${session.id}/vitals/clear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(clearPayload),
    });

    if (!res.ok) {
      throw new Error("Failed to clear canceled reading");
    }

    queryClient.invalidateQueries({ queryKey: ["session", sessionToken] });
  } catch (err) {
    console.error("Failed to clear canceled reading:", err);
    toast({ title: "Error", description: "Failed to clear canceled reading", variant: "destructive" });
  }
};

  const getReadingDisplay = (vital: VitalType) => {
    switch (vital) {
      case "bp": {
        const live = getLiveReadingValue("bp") as {
          sys: number;
          dia: number;
          pulseRate?: number;
        } | null;
        const sys = live?.sys ?? currentVitals.bloodPressureSystolic;
        const dia = live?.dia ?? currentVitals.bloodPressureDiastolic;
        return {
          title: "Blood Pressure",
          value: sys != null && dia != null ? `${sys}/${dia}` : "Reading...",
          unit: "mmHg",
          detail: (live?.pulseRate ?? currentVitals.bloodPressurePulse) != null
            ? `Cuff pulse: ${live?.pulseRate ?? currentVitals.bloodPressurePulse} bpm`
            : undefined,
          hasValue: sys != null && dia != null,
        };
      }
      case "hr": {
        const liveValue = getLiveReadingValue("hr");
        const value = readingVital === "hr" ? liveValue : liveValue ?? currentVitals.heartRate;
        return {
          title: "Heart Rate",
          value: value != null ? Number(value).toFixed(0) : "Reading...",
          unit: "bpm",
          hasValue: value != null,
        };
      }
      case "spo2": {
        const liveValue = getLiveReadingValue("spo2");
        const value = readingVital === "spo2" ? liveValue : liveValue ?? currentVitals.oxygenSaturation;
        return {
          title: "SpO2",
          value: value != null ? Number(value).toFixed(0) : "Reading...",
          unit: "%",
          hasValue: value != null,
        };
      }
      case "weight": {
        const value = getLiveReadingValue("weight") ?? currentVitals.weight;
        return {
          title: "Weight",
          value: value != null ? Number(value).toFixed(2) : "Reading...",
          unit: "kg",
          hasValue: value != null,
        };
      }
      case "height": {
        const value = getLiveReadingValue("height") ?? currentVitals.height;
        return {
          title: "Height",
          value: value != null ? Number(value).toFixed(1) : "Reading...",
          unit: "cm",
          hasValue: value != null,
        };
      }
      case "temperature": {
        const value = getLiveReadingValue("temperature") ?? currentVitals.temperature;
        return {
          title: "Temperature",
          value: value != null ? Number(value).toFixed(1) : "Reading...",
          unit: "°C",
          hasValue: value != null,
        };
      }
    }
  };

  if (isLoading)
    return (
      <div className="p-6 text-center text-xl font-bold text-muted-foreground h-dvh bg-background pt-16">
        Loading session...
      </div>
    );

  if (!session) return <NotFound />;

  return (
    <div className="h-dvh bg-background flex flex-col overflow-hidden"
    >
      <KioskHeader
        title={`Recording: ${session.patientName}`}
        wsConnected={wsConnected}
      />

      <main className="flex-1 p-4 pb-28 max-w-[60rem] portrait:max-w-2xl mx-auto w-full min-h-0 overflow-y-auto">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-2xl font-display font-bold text-foreground">
              Vital Signs
            </h2>
            <p className="text-base text-muted-foreground mt-1">
              {!mqttConnected
                ? "MQTT disconnected — sensors unavailable."
                : max30102Available === false
                  ? "MAX30102 not detected at I²C address 0x57 — heart rate and SpO₂ are unavailable."
                  : "Tap any card to record a measurement."}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 portrait:grid-cols-1 gap-3 mb-4">
          {/* Blood Pressure */}
          <VitalCard
            title="Blood Pressure"
            value={currentVitals.bloodPressureSystolic}
            secondaryValue={currentVitals.bloodPressureDiastolic}
            detail={currentVitals.bloodPressurePulse != null
              ? `Cuff pulse: ${currentVitals.bloodPressurePulse} bpm`
              : undefined}
            unit="mmHg"
            icon={<Heart className="w-7 h-7" />}
            status={getBPStatus(
              currentVitals.bloodPressureSystolic,
              currentVitals.bloodPressureDiastolic,
            )}
            onClick={() => {
              if (isRateLimited("bp")) return;
              if (isVitalDisabled("bp")) return;
              setActiveKeypad("bp");
              setActiveSensor(
                sensorGuides.find((s) => s.name === "Blood Pressure Cuff") ||
                  null,
              );
            }}
            disabled={isVitalDisabled("bp")}
            isDouble
          />

           {/* Heart Rate & SpO2 (combined) */}
           <div
             onClick={() => {
               if (isRateLimited("hr-spo2")) return;
               if (isVitalDisabled("hr") && isVitalDisabled("spo2")) return;
               setActiveKeypad("hr");
               setActiveSensor(
                 sensorGuides.find((s) => s.name === "Pulse Oximeter Sensor") ||
                   null,
               );
             }}
             className={`
               relative overflow-hidden group
               bg-card rounded-xl p-5 border-2
               ${(isVitalDisabled("hr") && isVitalDisabled("spo2")) ? "cursor-not-allowed opacity-50 border-border/50" : "cursor-pointer border-border/50 hover:border-primary/50"}
             `}
           >
             <div className="flex justify-between items-start mb-4">
               <div className="flex items-center gap-3">
                 <div className="p-3 rounded-xl bg-secondary text-primary">
                   <Activity className="w-7 h-7" />
                 </div>
                 <h3 className="text-2xl font-bold text-foreground">Heart Rate & SpO2</h3>
               </div>
               {isVitalDisabled("hr") && isVitalDisabled("spo2") ? (
                 <div className="flex items-center gap-1.5 text-base text-muted-foreground/60 py-1">
                   <Lock className="w-4 h-4" />
                   <span>{max30102Available === false ? "Not detected" : "Disabled"}</span>
                 </div>
               ) : (
                 <div className="flex items-center gap-1.5 text-base text-muted-foreground/60 py-1">
                   <Plus className="w-4 h-4" />
                   <span>Tap to record</span>
                 </div>
               )}
             </div>

             <div className="mt-3 flex items-baseline gap-4">
               <div className="flex items-baseline gap-1">
                 <span className="text-4xl font-display font-bold text-foreground tracking-tight">
                   {currentVitals.heartRate ?? "--"}
                 </span>
                 <span className="text-2xl font-medium text-muted-foreground ml-0.5">
                   bpm
                 </span>
               </div>
               <span className="text-2xl text-muted-foreground font-light">|</span>
               <div className="flex items-baseline gap-1">
                 <span className="text-4xl font-display font-bold text-foreground tracking-tight">
                   {currentVitals.oxygenSaturation ?? "--"}
                 </span>
                 <span className="text-2xl font-medium text-muted-foreground ml-0.5">
                   %
                 </span>
               </div>
             </div>
           </div>

            {/* Temperature */}
            <VitalCard
              title="Temperature"
              value={currentVitals.temperature}
              unit="°C"
              icon={<Thermometer className="w-7 h-7" />}
              status={getTempStatus(currentVitals.temperature)}
              onClick={() => {
                if (isRateLimited("temperature")) return;
                if (isVitalDisabled("temperature")) return;
                setActiveKeypad("temperature");
                setActiveSensor(
                  sensorGuides.find((s) => s.name === "Thermometer") || null,
                );
              }}
              disabled={isVitalDisabled("temperature")}
            />

            {/* Weight */}
            <VitalCard
             title="Weight"
             value={currentVitals.weight}
             unit="kg"
             icon={<Scale className="w-7 h-7" />}
             status="unknown"
             onClick={() => {
               if (isRateLimited("weight")) return;
               if (isVitalDisabled("weight")) return;
               setActiveKeypad("weight");
               setActiveSensor(
                 sensorGuides.find((s) => s.name === "Body Weight Scale") ||
                   null,
               );
             }}
             disabled={isVitalDisabled("weight")}
           />

           {/* Height */}
           <VitalCard
             title="Height"
             value={currentVitals.height}
             detail={heightInches != null
               ? `${Math.floor(heightInches / 12)} ft ${heightInches % 12} in`
               : undefined}
             unit="cm"
             icon={<Ruler className="w-7 h-7" />}
             status="unknown"
             onClick={() => {
               if (isRateLimited("height")) return;
               if (isVitalDisabled("height")) return;
               setActiveKeypad("height");
               setActiveSensor(
                 sensorGuides.find(
                   (s) => s.name === "Height Measurement Sensor",
                 ) || null,
               );
             }}
             disabled={isVitalDisabled("height")}
           />

          {/* Auto BMI */}
          <div className="relative overflow-hidden bg-secondary/30 rounded-xl p-5 border border-border/50 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-2xl font-bold text-foreground">BMI (Auto)</h3>

              {autoBMI && (
                <div
                  className={`px-2 py-1 rounded-full text-xs font-bold tracking-wide uppercase ${getStatusColor(
                    getBMIStatus(autoBMI),
                  )}`}
                >
                  {getStatusText(getBMIStatus(autoBMI))}
                </div>
              )}
            </div>

            <div>
              {autoBMI ? (
                <div className="flex items-baseline gap-1.5">
                  <span className="text-4xl font-display font-bold text-foreground">
                    {autoBMI}
                  </span>
                  <span className="text-2xl text-muted-foreground font-medium">
                    kg/m²
                  </span>
                </div>
              ) : (
                <div className="text-lg text-muted-foreground/80 font-medium pb-1">
                  Enter weight and height
                </div>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Adult BMI screening range; pediatric BMI requires age- and sex-specific growth charts.
            </p>
          </div>
        </div>
      </main>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-[0_-4px_15px_rgba(0,0,0,0.05)] p-4 z-10 flex justify-center">
          <AlertDialog open={showFinishConfirm} onOpenChange={setShowFinishConfirm}>
            <button
              onClick={() => {
                if (isRateLimited("finish")) return;
                setShowFinishConfirm(true);
              }}
              className="w-full max-w-[60rem] portrait:max-w-2xl h-16 bg-primary hover:bg-primary/90 text-primary-foreground text-2xl font-display font-bold rounded-lg shadow-xl shadow-primary/25 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-6 h-6" />
              Finish & View Results
            </button>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-2xl">Finish Session?</AlertDialogTitle>
              <AlertDialogDescription className="text-lg">
                Are you sure you want to finish this measurement session and view your results?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="mt-6">
              <AlertDialogCancel className="h-12 text-xl font-bold flex-1 bg-secondary hover:bg-secondary/80">
                Cancel
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (isRateLimited("finish-confirm")) return;
                  setLocation(
                    `/results?token=${encodeURIComponent(sessionToken)}`,
                  );
                }}
                className="h-12 text-xl font-bold flex-1 bg-primary text-primary-foreground hover:bg-primary/80"
              >
                Yes, Finish
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      <InstructionModal
        isOpen={activeSensor !== null}
        onClose={() => setActiveSensor(null)}
        onStart={handleStartReading}
        sensorGuide={activeSensor || undefined}
      />

      {/* Reading Display - shows real-time MQTT value */}
        <ModalShell
          open={readingVital !== null}
          zIndex={50}
          backdrop="blur"
          panelClassName="bg-card rounded-3xl shadow-2xl p-8 w-full max-w-md border border-border/50"
        >
          {readingVital && (
            <>
              {(() => {
                const display = getReadingDisplay(readingVital);
                const isHrSpo2 = readingVital === "hr";
                const hrDisplay = isHrSpo2 ? {
                  title: "Heart Rate",
                  value: hrValue != null ? Number(hrValue).toFixed(0) : "Reading...",
                  unit: "bpm",
                  hasValue: hrValue != null,
                } : null;
                const spo2Display = isHrSpo2 ? {
                  title: "SpO2",
                  value: spo2Value != null ? Number(spo2Value).toFixed(0) : "Reading...",
                  unit: "%",
                  hasValue: spo2Value != null,
                } : null;

                return (
                  <>
              {isHrSpo2 ? (
                <>
                  <h2 className="text-2xl font-bold mb-6 text-center">Heart Rate & SpO2</h2>
                  {fingerPresent || readingConfirmed ? (
                    <>
                      <div className="flex items-center justify-center gap-6 mb-6">
                        <div className="text-center">
                          <div className={`font-bold font-display text-primary mb-1 ${hrDisplay?.hasValue ? "text-5xl" : "text-3xl"}`}>
                            {hrDisplay?.value}
                          </div>
                          <div className="text-base text-muted-foreground">{hrDisplay?.unit}</div>
                          <div className="text-sm text-muted-foreground/70 mt-1">Heart Rate</div>
                        </div>
                        <div className="text-4xl text-muted-foreground/30 font-light">|</div>
                        <div className="text-center">
                          <div className={`font-bold font-display text-primary mb-1 ${spo2Display?.hasValue ? "text-5xl" : "text-3xl"}`}>
                            {spo2Display?.value}
                          </div>
                          <div className="text-base text-muted-foreground">{spo2Display?.unit}</div>
                          <div className="text-sm text-muted-foreground/70 mt-1">SpO2</div>
                        </div>
                      </div>
                      <p className="text-center text-muted-foreground mb-6">
                        {readingConfirmed
                          ? "Your reading has been recorded. Press Done to continue."
                          : hrDisplay?.hasValue && spo2Display?.hasValue
                            ? "Keep your finger still and lightly covering the sensor while the reading stabilizes."
                            : "Keep your finger still on the sensor while the reading is being measured..."}
                      </p>
                    </>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center py-6 mb-2">
                      <div className="w-24 h-24 rounded-full bg-primary/10 border-2 border-primary/30 flex items-center justify-center mb-5">
                        <Fingerprint className="w-12 h-12 text-primary" />
                      </div>
                      <p className="text-3xl font-display font-bold text-foreground mb-2">
                        Please insert your finger
                      </p>
                      <p className="text-lg text-muted-foreground max-w-xs">
                        {fingerState === "absent"
                          ? "Place your finger on the pulse oximeter sensor to start measuring."
                          : "Waiting for the pulse oximeter sensor to report..."}
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <>
              <h2 className="text-2xl font-bold mb-6 text-center">
                {display.title}
              </h2>

              {readingVital === "bp" && bpReading?.status === "running" && (
                <div className="mb-6 space-y-2" aria-live="polite">
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>{bpReading.stage === "deflating" ? "Releasing cuff pressure" : "Inflating cuff"}</span>
                    <span>{Math.round(Number(bpReading.progress) || 0)}%</span>
                  </div>
                  <Progress value={Number(bpReading.progress) || 0} aria-label="Blood pressure measurement progress" />
                  {Number.isFinite(Number(bpReading.pressure)) && (
                    <p className="text-center text-sm text-muted-foreground">
                      Cuff pressure: {Number(bpReading.pressure).toFixed(0)} mmHg
                    </p>
                  )}
                </div>
              )}

              <div className="text-center mb-8">
                  <div className={`font-bold font-display text-primary mb-2 ${display.hasValue ? "text-6xl" : "text-4xl"}`}>
                    {display.value}
                  </div>
                  <div className="text-xl text-muted-foreground">
                    {display.unit}
                </div>
              </div>

              {readingVital === "bp" && bpComplete && (
                <p className="text-center text-lg font-semibold mb-6">
                  Cuff pulse: {cuffPulseRate.toFixed(0)} bpm
                </p>
              )}

              <p className="text-center text-muted-foreground mb-6">
                        {readingVital === "bp"
                          ? bpComplete
                            ? "Measurement complete. Press Done to continue."
                            : bpReading?.status === "failed"
                              ? `Measurement failed: ${bpReading.error || "Please cancel and try again."}`
                              : "Keep your arm still while the cuff measures and releases pressure..."
                          : display.hasValue ? "Reading from sensor..." : "Waiting for sensor data..."}
              </p>
                </>
              )}
                  </>
                );
              })()}

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    if (isRateLimited("cancel-reading")) return;
                    handleCancelReading();
                  }}
                  className="flex-1 px-6 py-4 bg-gray-200 rounded-lg hover:bg-gray-300 font-semibold text-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    if (isRateLimited("done-reading")) return;
                    handleDoneReading();
                  }}
                  disabled={!isStable}
                  className="flex-1 px-6 py-4 bg-primary text-white rounded-lg hover:bg-primary-dark font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Done {!isStable && `(${stableCount}/${requiredStableCount})`}
                </button>
              </div>

              {readingVital === "hr" && !isStable && (
                <p className="text-center text-sm text-muted-foreground mt-3">
                  {!fingerPresent
                    ? "Waiting for a finger on the sensor."
                    : "Waiting for a stable reading."}
                </p>
              )}
            </>
          )}
      </ModalShell>
    </div>
  );
}
