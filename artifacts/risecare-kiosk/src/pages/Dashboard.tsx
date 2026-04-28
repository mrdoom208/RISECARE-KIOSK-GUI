import { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRoute, useLocation } from "wouter";
import { useSaveVitals } from "@workspace/api-client-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
// @ts-ignore - Session type from @workspace/api-zod
type Session = any;
import {
  Heart,
  Activity,
  Thermometer,
  Droplet,
  Scale,
  Ruler,
  Wind,
  CheckCircle2,
} from "lucide-react";
import { getStatusColor, getStatusText } from "@/lib/vitals-utils";
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

import {
  getBPStatus,
  getHRStatus,
  getSpO2Status,
  getTempStatus,
  getGlucoseStatus,
  getBMIStatus,
  calculateBMI,
} from "@/lib/vitals-utils";

type VitalType =
  | "bp"
  | "hr"
  | "spo2"
  | "temp"
  | "weight"
  | "height"
  | "glucose";

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

  const isStable = stableCount >= 5;

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

  const saveVitalsMutation = useSaveVitals();

  const currentVitals = useMemo<Vitals>(() => {
    if (!session?.vitals) return {};
    return session.vitals.reduce((acc: Vitals, curr: Vitals) => ({ ...acc, ...curr }), {});
  }, [session]);

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
        currentValue = currentVitals.bloodPressureSystolic && currentVitals.bloodPressureDiastolic
          ? { sys: currentVitals.bloodPressureSystolic, dia: currentVitals.bloodPressureDiastolic }
          : null;
        break;
      case "hr":
        currentValue = currentVitals.heartRate;
        break;
      case "spo2":
        currentValue = currentVitals.oxygenSaturation;
        break;
      case "temp":
        currentValue = currentVitals.temperature;
        break;
      case "weight":
        currentValue = currentVitals.weight;
        break;
      case "height":
        currentValue = currentVitals.height;
        break;
      case "glucose":
        currentValue = currentVitals.bloodGlucose;
        break;
    }

    if (currentValue === null) return;

    if (prevValue !== null) {
      let isFar = false;
      if (readingVital === "bp") {
        const diffSys = Math.abs(currentValue.sys - prevValue.sys);
        const diffDia = Math.abs(currentValue.dia - prevValue.dia);
        isFar = diffSys > 5 || diffDia > 5;
      } else {
        const diff = Math.abs(currentValue - prevValue);
        isFar = diff > 2;
      }

      if (isFar) {
        setStableCount(0);
        prevValueRef.current = currentValue;
        return;
      }
    }

    if (JSON.stringify(currentValue) === JSON.stringify(prevValueRef.current)) {
      setStableCount(prev => prev + 1);
    } else {
      setStableCount(0);
    }
    prevValueRef.current = currentValue;
  }, [currentVitals, readingVital]);

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
    else if (activeKeypad === "temp") payload.temperature = num1;
    else if (activeKeypad === "weight") payload.weight = num1;
    else if (activeKeypad === "height") payload.height = num1;
    else if (activeKeypad === "glucose") payload.bloodGlucose = num1;

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

  const handleStartReading = () => {
    if (!activeSensor) return;
    setReadingVital(activeKeypad);
    setActiveSensor(null);
  };

  if (isLoading)
    return (
      <div className="p-6 text-center text-xl font-bold text-muted-foreground min-h-screen bg-background pt-16">
        Loading session...
      </div>
    );

  if (!session) return <NotFound />;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="h-screen bg-background flex flex-col overflow-hidden"
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

          {/* Heart Rate */}
          <VitalCard
            title="Heart Rate"
            value={currentVitals.heartRate}
            unit="bpm"
            icon={<Activity className="w-5 h-5" />}
            status={getHRStatus(currentVitals.heartRate)}
            onClick={() => {
              setActiveKeypad("hr");
              setActiveSensor(
                sensorGuides.find((s) => s.name === "Pulse Oximeter Sensor") ||
                  null,
              );
            }}
          />

          {/* SpO2 */}
          <VitalCard
            title="SpO2"
            value={currentVitals.oxygenSaturation}
            unit="%"
            icon={<Wind className="w-5 h-5" />}
            status={getSpO2Status(currentVitals.oxygenSaturation)}
            onClick={() => {
              setActiveKeypad("spo2");
              setActiveSensor(
                sensorGuides.find((s) => s.name === "Pulse Oximeter Sensor") ||
                  null,
              );
            }}
          />

          {/* Temperature */}
          <VitalCard
            title="Temperature"
            value={currentVitals.temperature}
            unit="°C"
            icon={<Thermometer className="w-5 h-5" />}
            status={getTempStatus(currentVitals.temperature)}
            onClick={() => {
              setActiveKeypad("temp");
              setActiveSensor(
                sensorGuides.find((s) => s.name === "Thermometer") || null,
              );
            }}
          />

          {/* Blood Glucose */}
          <VitalCard
            title="Blood Glucose"
            value={currentVitals.bloodGlucose}
            unit="mmol/L"
            icon={<Droplet className="w-5 h-5" />}
            status={getGlucoseStatus(currentVitals.bloodGlucose)}
            onClick={() => {
              setActiveKeypad("glucose");
              setActiveSensor(
                sensorGuides.find((s) => s.name === "Blood Glucose Sensor") ||
                  null,
              );
            }}
          />

          {/* Weight */}
          <VitalCard
            title="Weight"
            value={currentVitals.weight}
            unit="kg"
            icon={<Scale className="w-5 h-5" />}
            status="unknown"
            onClick={() => {
              setActiveKeypad("weight");
              setActiveSensor(
                sensorGuides.find((s) => s.name === "Body Weight Scale") ||
                  null,
              );
            }}
          />

          {/* Height */}
          <VitalCard
            title="Height"
            value={currentVitals.height}
            unit="cm"
            icon={<Ruler className="w-5 h-5" />}
            status="unknown"
            onClick={() => {
              setActiveKeypad("height");
              setActiveSensor(
                sensorGuides.find(
                  (s) => s.name === "Height Measurement Sensor",
                ) || null,
              );
            }}
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
            <button className="w-full max-w-[800px] h-12 bg-primary hover:bg-primary/90 text-primary-foreground text-xl font-display font-bold rounded-lg shadow-xl shadow-primary/25 active:scale-95 transition-all flex items-center justify-center gap-2">
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
      <AnimatePresence>
        {readingVital && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              transition={{ duration: 0.2 }}
              className="bg-card rounded-3xl shadow-2xl p-8 w-full max-w-md border border-border/50"
            >
              <h2 className="text-2xl font-bold mb-6 text-center">
                {readingVital === "bp" && "Blood Pressure"}
                {readingVital === "hr" && "Heart Rate"}
                {readingVital === "spo2" && "SpO2"}
                {readingVital === "temp" && "Temperature"}
                {readingVital === "weight" && "Weight"}
                {readingVital === "height" && "Height"}
                {readingVital === "glucose" && "Blood Glucose"}
              </h2>

              <div className="text-center mb-8">
                <div className="text-6xl font-bold font-display text-primary mb-2">
                  {readingVital === "bp" && currentVitals.bloodPressureSystolic
                    ? `${currentVitals.bloodPressureSystolic}/${currentVitals.bloodPressureDiastolic || "..."}`
                    : readingVital === "hr" && currentVitals.heartRate
                    ? currentVitals.heartRate
                    : readingVital === "spo2" && currentVitals.oxygenSaturation
                    ? currentVitals.oxygenSaturation
                    : readingVital === "temp" && currentVitals.temperature
                    ? currentVitals.temperature
                    : readingVital === "weight" && currentVitals.weight
                    ? currentVitals.weight
                    : readingVital === "height" && currentVitals.height
                    ? currentVitals.height
                    : readingVital === "glucose" && currentVitals.bloodGlucose
                    ? currentVitals.bloodGlucose
                    : "..."}
                </div>
                <div className="text-xl text-muted-foreground">
                  {readingVital === "bp" && "mmHg"}
                  {readingVital === "hr" && "bpm"}
                  {readingVital === "spo2" && "%"}
                  {readingVital === "temp" && "°C"}
                  {readingVital === "weight" && "kg"}
                  {readingVital === "height" && "cm"}
                  {readingVital === "glucose" && "mmol/L"}
                </div>
              </div>

              <p className="text-center text-muted-foreground mb-6">
                Reading from sensor...
              </p>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setReadingVital(null);
                    setStableCount(0);
                  }}
                  className="flex-1 px-6 py-4 bg-gray-200 rounded-lg hover:bg-gray-300 transition font-semibold text-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    setReadingVital(null);
                    setStableCount(0);
                  }}
                  disabled={!isStable}
                  className="flex-1 px-6 py-4 bg-primary text-white rounded-lg hover:bg-primary-dark transition font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Done {!isStable && `(${stableCount}/5)`}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
