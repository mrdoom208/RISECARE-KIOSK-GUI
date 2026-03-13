import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetSession, useSaveVitals } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
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
import type { Vitals } from "@/types/vitals";
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
  const [, params] = useRoute("/session/:id");
  const [, setLocation] = useLocation();
  const sessionId = parseInt(params?.id || "0", 10);
  const queryClient = useQueryClient();

  const { data: session, isLoading } = useGetSession(sessionId);
  const saveVitalsMutation = useSaveVitals();

  const [activeKeypad, setActiveKeypad] = useState<VitalType | null>(null);
  const [activeSensor, setActiveSensor] = useState<
    (typeof sensorGuides)[0] | null
  >(null);

  const currentVitals = useMemo<Vitals>(() => {
    if (!session?.vitals) return {};
    return session.vitals.reduce((acc, curr) => ({ ...acc, ...curr }), {});
  }, [session]);

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
      { id: sessionId, data: payload },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: [`/api/sessions/${sessionId}`],
          });
          setActiveKeypad(null);
        },
      },
    );
  };

  if (isLoading)
    return (
      <div className="p-6 text-center text-xl font-bold text-muted-foreground min-h-screen bg-background pt-16">
        Loading session...
      </div>
    );

  if (!session) return <NotFound />;

  return (
    <div className="min-h-screen bg-background flex flex-col pb-16">
      <KioskHeader
        title={`Recording: ${session.patientName}`}
        showBack
        backTo="/"
      />

      <main className="flex-1 p-4 max-w-[800px] mx-auto w-full">
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

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
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
        <button
          onClick={() => setLocation(`/session/${sessionId}/results`)}
          className="w-full max-w-[800px] h-12 bg-primary hover:bg-primary/90 text-primary-foreground text-xl font-display font-bold rounded-lg shadow-xl shadow-primary/25 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-5 h-5" />
          Finish & View Results
        </button>
      </div>

      <InstructionModal
        isOpen={activeSensor !== null}
        onClose={() => setActiveSensor(null)}
        onSave={handleSaveVital}
        sensorGuide={activeSensor || undefined}
      />
    </div>
  );
}
