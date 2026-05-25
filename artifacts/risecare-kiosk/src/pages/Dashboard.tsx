import { useState, useMemo, useEffect, useRef } from "react";
import { useRoute, useLocation } from "wouter";
import { useSaveVitals } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import { getStatusColor, getStatusText, getBPStatus, getHRStatus, getSpO2Status, getTempStatus, getBMIStatus, calculateBMI } from "@/lib/vitals-utils";
import { KioskHeader } from "@/components/KioskHeader";
import { VitalCard } from "@/components/VitalCard";
import InstructionModal from "@/components/InstructionModal";
import { KeypadDialog } from "@/components/KeypadDialog";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import NotFound from "./not-found";

import { sensorGuides } from "@/data/sensorGuides";

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
  const [, params] = useRoute("/session/:token");
  const [, setLocation] = useLocation();
  const sessionToken = params?.token || "";
  const queryClient = useQueryClient();

  const [activeKeypad, setActiveKeypad] = useState<VitalType | null>(null);
  const [activeSensor, setActiveSensor] = useState<
    (typeof sensorGuides)[0] | null
  >(null);
  const [readingVital, setReadingVital] = useState<VitalType | null>(null);
  const [stableCount, setStableCount] = useState(0);
  const prevValueRef = useRef<any>(null);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [enabledSensors, setEnabledSensors] = useState<Record<string, boolean>>({});
  const STABLE_READING_THRESHOLD = 3;
  const STABLE_READING_COUNT = 5;

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

  const isStable = stableCount >= STABLE_READING_COUNT;

  // Check if a vital's sensor is enabled
  const isVitalEnabled = (vital: VitalType) => {
    const sensorId = vitalToSensorId[vital];
    return enabledSensors[sensorId] || false;
  };

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
    refetchInterval: readingVital ? 2000 : false, // Poll every 2s while reading
  });

  const { data: latestSensorReadings } = useQuery({
    queryKey: ["latest-sensor-readings"],
    queryFn: async () => {
      const res = await fetch("/api/sensors/latest-readings");
      if (!res.ok) throw new Error("Failed to load sensor readings");
      return res.json();
    },
    enabled: !!readingVital,
    refetchInterval: readingVital ? 500 : false,
  });

  const saveVitalsMutation = useSaveVitals();

  const currentVitals = useMemo<Vitals>(() => {
    if (!session?.vitals) return {};
    return session.vitals.reduce((acc: Vitals, curr: Vitals) => ({ ...acc, ...curr }), {});
  }, [session]);

  const getLiveReadingValue = (vital: VitalType) => {
    const sensorId = vitalToSensor[vital];
    const reading = latestSensorReadings?.[sensorId];

    if (!reading || String(reading.sessionId) !== String(session?.id)) return null;

    switch (vital) {
      case "bp":
        return reading.systolic != null && reading.diastolic != null
          ? { sys: reading.systolic, dia: reading.diastolic }
          : null;
      case "hr":
        return reading.bpm && reading.bpm > 0 ? reading.bpm : null;
      case "spo2":
        return reading.spo2 && reading.spo2 > 0 ? reading.spo2 : null;
      case "weight":
        return reading.kg && reading.kg > 0 ? reading.kg : null;
      case "height":
        return reading.cm && reading.cm > 0 ? reading.cm : null;
      case "temperature":
        return reading.celsius && reading.celsius > 0 ? reading.celsius : null;
    }
  };

  useEffect(() => {
    if (!readingVital || !session) {
      setStableCount(0);
      prevValueRef.current = null;
      return;
    }

    let currentValue: any;
    let prevValue: any = prevValueRef.current;

    switch (readingVital) {
      case "bp":
        currentValue = getLiveReadingValue("bp") ??
          (currentVitals.bloodPressureSystolic != null && currentVitals.bloodPressureDiastolic != null
            ? { sys: currentVitals.bloodPressureSystolic, dia: currentVitals.bloodPressureDiastolic }
            : null);
        break;
      case "hr":
        currentValue = getLiveReadingValue("hr") ?? currentVitals.heartRate;
        break;
      case "spo2":
        currentValue = getLiveReadingValue("spo2") ?? currentVitals.oxygenSaturation;
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

    if (currentValue == null) return;

    if (prevValue !== null) {
      let isNear = false;
      if (readingVital === "bp") {
        const diffSys = Math.abs(currentValue.sys - prevValue.sys);
        const diffDia = Math.abs(currentValue.dia - prevValue.dia);
        isNear = diffSys <= STABLE_READING_THRESHOLD && diffDia <= STABLE_READING_THRESHOLD;
      } else {
        const diff = Math.abs(currentValue - prevValue);
        isNear = diff <= STABLE_READING_THRESHOLD;
      }

      if (isNear) {
        setStableCount((prev) => Math.min(prev + 1, STABLE_READING_COUNT));
      } else {
        setStableCount(1);
        prevValueRef.current = currentValue;
        return;
      }
    } else {
      setStableCount(1);
    }

    prevValueRef.current = currentValue;
  }, [currentVitals, latestSensorReadings, readingVital]);

  const autoBMI = calculateBMI(currentVitals.weight, currentVitals.height);

  const handleSaveVital = (val1: string, val2?: string) => {
    if (!activeKeypad) return;

    const num1 = val1 ? parseFloat(val1) : null;
    const num2 = val2 ? parseFloat(val2) : null;

    const payload: any = {};

    if (activeKeypad === "bp") {
      payload.bloodPressureSystolic = num1;
      payload.bloodPressureDiastolic = num2;
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
            queryKey: [`/api/sessions/token`],
          });
          setActiveKeypad(null);
        },
      },
    );
  };

  const vitalToSensor: Record<VitalType, string> = {
    bp: "bp",
    hr: "heartrate",
    spo2: "spo2",
    weight: "weight",
    height: "height",
    temperature: "temperature",
  };

const handleStartReading = async () => {
  if (!activeSensor || !activeKeypad || !session?.id) return;

  try {
    await fetch("/api/sensors/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        sensor: vitalToSensor[activeKeypad],
        value: 1,
      }),
    });
  } catch (err) {
    console.error("Failed to send start command:", err);
  }

  setReadingVital(activeKeypad);
  setActiveSensor(null);
};

const stopSensor = async () => {
  if (!readingVital || !session?.id) return;
  try {
    await fetch("/api/sensors/command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: session.id,
        sensor: vitalToSensor[readingVital],
        value: 0,
      }),
    });
  } catch (err) {
    console.error("Failed to send stop command:", err);
  }
  setReadingVital(null);
  setStableCount(0);
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
  } else if (vital === "weight") {
    clearPayload.weight = null;
  } else if (vital === "height") {
    clearPayload.height = null;
  } else if (vital === "temperature") {
    clearPayload.temperature = null;
  }

  saveVitalsMutation.mutate(
    { id: Number(sessionToken), data: clearPayload },
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: [`/api/sessions/token`] });
      },
    },
  );
};

  const getReadingDisplay = (vital: VitalType) => {
    switch (vital) {
      case "bp": {
        const live = getLiveReadingValue("bp") as { sys: number; dia: number } | null;
        const sys = live?.sys ?? currentVitals.bloodPressureSystolic;
        const dia = live?.dia ?? currentVitals.bloodPressureDiastolic;
        return {
          title: "Blood Pressure",
          value: sys != null && dia != null ? `${sys}/${dia}` : "Reading...",
          unit: "mmHg",
          hasValue: sys != null && dia != null,
        };
      }
      case "hr": {
        const value = getLiveReadingValue("hr") ?? currentVitals.heartRate;
        return {
          title: "Heart Rate",
          value: value != null ? Number(value).toFixed(0) : "Reading...",
          unit: "bpm",
          hasValue: value != null,
        };
      }
      case "spo2": {
        const value = getLiveReadingValue("spo2") ?? currentVitals.oxygenSaturation;
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
      <div className="p-6 text-center text-xl font-bold text-muted-foreground min-h-screen bg-background pt-16">
        Loading session...
      </div>
    );

  if (!session) return <NotFound />;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden"
    >
      <KioskHeader
        title={`Recording: ${session.patientName}`}
      />

      <main className="flex-1 p-4 pb-20 max-w-[800px] mx-auto w-full min-h-0 overflow-y-auto">
        <div className="flex justify-between items-end mb-4">
          <div>
            <h2 className="text-2xl font-display font-bold text-foreground">
              Vital Signs
            </h2>
            <p className="text-base text-muted-foreground mt-1">
              Tap any card to record a measurement.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 mb-4">
          {/* Blood Pressure */}
          <VitalCard
            title="Blood Pressure"
            value={currentVitals.bloodPressureSystolic}
            secondaryValue={currentVitals.bloodPressureDiastolic}
            unit="mmHg"
            icon={<Heart className="w-5 h-5" />}
            status={getBPStatus(
              currentVitals.bloodPressureSystolic,
              currentVitals.bloodPressureDiastolic,
            )}
            onClick={() => {
              setActiveKeypad("bp");
              setActiveSensor(
                sensorGuides.find((s) => s.name === "Blood Pressure Cuff") ||
                  null,
              );
            }}
            isDouble
          />

           {/* Heart Rate & SpO2 (combined) */}
           <div
             onClick={() => {
               if (!isVitalEnabled("hr") && !isVitalEnabled("spo2")) return;
               setActiveKeypad("hr");
               setActiveSensor(
                 sensorGuides.find((s) => s.name === "Pulse Oximeter Sensor") ||
                   null,
               );
             }}
             className={`
               relative overflow-hidden group
               bg-card rounded-xl p-3 border-2
               cursor-pointer shadow-sm border-border/50 hover:border-primary/50
             `}
           >
             <div className="flex justify-between items-start mb-3">
               <div className="flex items-center gap-2">
                 <div className="p-2 rounded-xl bg-secondary text-primary">
                   <Activity className="w-5 h-5" />
                 </div>
                 <h3 className="text-xl font-bold text-foreground">Heart Rate & SpO2</h3>
               </div>
               <div className="flex items-center gap-1.5 text-sm text-muted-foreground/60 py-1">
                 <Plus className="w-4 h-4" />
                 <span>Tap to record</span>
               </div>
             </div>

             <div className="mt-2 flex items-baseline gap-4">
               <div className="flex items-baseline gap-1">
                 <span className="text-3xl font-display font-bold text-foreground tracking-tight">
                   {currentVitals.heartRate ?? "--"}
                 </span>
                 <span className="text-xl font-medium text-muted-foreground ml-0.5">
                   bpm
                 </span>
               </div>
               <span className="text-2xl text-muted-foreground font-light">|</span>
               <div className="flex items-baseline gap-1">
                 <span className="text-3xl font-display font-bold text-foreground tracking-tight">
                   {currentVitals.oxygenSaturation ?? "--"}
                 </span>
                 <span className="text-xl font-medium text-muted-foreground ml-0.5">
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
              icon={<Thermometer className="w-5 h-5" />}
              status={getTempStatus(currentVitals.temperature)}
              onClick={() => {
                if (!isVitalEnabled("temperature")) return;
                setActiveKeypad("temperature");
                setActiveSensor(
                  sensorGuides.find((s) => s.name === "Thermometer") || null,
                );
              }}
              disabled={!isVitalEnabled("temperature")}
            />

            {/* Weight */}
            <VitalCard
             title="Weight"
             value={currentVitals.weight}
             unit="kg"
             icon={<Scale className="w-5 h-5" />}
             status="unknown"
             onClick={() => {
               if (!isVitalEnabled("weight")) return;
               setActiveKeypad("weight");
               setActiveSensor(
                 sensorGuides.find((s) => s.name === "Body Weight Scale") ||
                   null,
               );
             }}
             disabled={!isVitalEnabled("weight")}
           />

           {/* Height */}
           <VitalCard
             title="Height"
             value={currentVitals.height}
             unit="cm"
             icon={<Ruler className="w-5 h-5" />}
             status="unknown"
             onClick={() => {
               if (!isVitalEnabled("height")) return;
               setActiveKeypad("height");
               setActiveSensor(
                 sensorGuides.find(
                   (s) => s.name === "Height Measurement Sensor",
                 ) || null,
               );
             }}
             disabled={!isVitalEnabled("height")}
           />

          {/* Auto BMI */}
          <div className="relative overflow-hidden bg-secondary/30 rounded-xl p-3 border border-border/50 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-3">
              <h3 className="text-xl font-bold text-foreground">BMI (Auto)</h3>

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
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-display font-bold text-foreground">
                    {autoBMI}
                  </span>
                  <span className="text-xl text-muted-foreground font-medium">
                    kg/m²
                  </span>
                </div>
              ) : (
                <div className="text-base text-muted-foreground/80 font-medium pb-1">
                  Enter weight and height
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-[0_-4px_15px_rgba(0,0,0,0.05)] p-3 z-10 flex justify-center">
        <AlertDialog open={showFinishConfirm} onOpenChange={setShowFinishConfirm}>
          <AlertDialogTrigger asChild>
            <button className="w-full max-w-[800px] h-12 bg-primary hover:bg-primary/90 text-primary-foreground text-xl font-display font-bold rounded-lg shadow-xl shadow-primary/25 flex items-center justify-center gap-2">
              <CheckCircle2 className="w-5 h-5" />
              Finish & View Results
            </button>
          </AlertDialogTrigger>
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
                onClick={() => setLocation(`/session/${sessionToken}/results`)}
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
        {readingVital && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
            <div className="bg-card rounded-3xl shadow-2xl p-8 w-full max-w-md border border-border/50"
            >
              {(() => {
                const display = getReadingDisplay(readingVital);
                const isHrSpo2 = readingVital === "hr";
                const hrDisplay = isHrSpo2 ? getReadingDisplay("hr") : null;
                const spo2Display = isHrSpo2 ? (() => {
                  const spo2Value = getLiveReadingValue("spo2") ?? currentVitals.oxygenSaturation;
                  return {
                    title: "SpO2",
                    value: spo2Value != null ? Number(spo2Value).toFixed(0) : "Reading...",
                    unit: "%",
                    hasValue: spo2Value != null,
                  };
                })() : null;

                return (
                  <>
              {isHrSpo2 ? (
                <>
                  <h2 className="text-2xl font-bold mb-6 text-center">Heart Rate & SpO2</h2>
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
                    {hrDisplay?.hasValue && spo2Display?.hasValue
                      ? "Reading from sensor..."
                      : "Waiting for sensor data..."}
                  </p>
                </>
              ) : (
                <>
              <h2 className="text-2xl font-bold mb-6 text-center">
                {display.title}
              </h2>

              <div className="text-center mb-8">
                  <div className={`font-bold font-display text-primary mb-2 ${display.hasValue ? "text-6xl" : "text-4xl"}`}>
                    {display.value}
                  </div>
                  <div className="text-xl text-muted-foreground">
                    {display.unit}
                </div>
              </div>

              <p className="text-center text-muted-foreground mb-6">
                {display.hasValue ? "Reading from sensor..." : "Waiting for sensor data..."}
              </p>
                </>
              )}
                  </>
                );
              })()}

              <div className="flex gap-4">
                <button
                  onClick={handleCancelReading}
                  className="flex-1 px-6 py-4 bg-gray-200 rounded-lg hover:bg-gray-300 font-semibold text-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDoneReading}
                  disabled={!isStable}
                  className="flex-1 px-6 py-4 bg-primary text-white rounded-lg hover:bg-primary-dark font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Done {!isStable && `(${stableCount}/${STABLE_READING_COUNT})`}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}
