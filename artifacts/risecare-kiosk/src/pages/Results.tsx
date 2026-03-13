import { useRoute, useLocation } from "wouter";
import { useGetSession } from "@workspace/api-client-react";
import { KioskHeader } from "@/components/KioskHeader";
import { Printer, Home, CheckCircle } from "lucide-react";
import { useState } from "react";
import {
  getBPStatus,
  getHRStatus,
  getSpO2Status,
  getTempStatus,
  getGlucoseStatus,
  getBMIStatus,
  calculateBMI,
  getStatusColor,
  VitalStatus,
} from "@/lib/vitals-utils";
import type { Vitals } from "@/types/vitals";
import { useMemo, useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clear } from "node:console";
export default function Results() {
  const [, params] = useRoute("/session/:id/results");
  const [, setLocation] = useLocation();
  const sessionId = parseInt(params?.id || "10", 10);
  const queryClient = useQueryClient();
  const [countdown, setCountdown] = useState(20);

  const { data: session, isLoading } = useGetSession(sessionId);

  // Compute current vitals
  const currentVitals = useMemo<Vitals>(() => {
    if (!session?.vitals) return {};
    return session.vitals.reduce((acc, curr) => ({ ...acc, ...curr }), {});
  }, [session]);

  const autoBMI = calculateBMI(currentVitals.weight, currentVitals.height);

  // Auto-reset the session after showing results (kiosk mode)
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    const timer = setTimeout(() => {
      queryClient.removeQueries({ queryKey: [`/api/sessions/${sessionId}`] });

      // Redirect to home
      setLocation("/");
    }, countdown * 1000); // 20 seconds display

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [sessionId, countdown]);

  if (isLoading)
    return (
      <div className="min-h-screen bg-background pt-16 text-center text-xl text-muted-foreground">
        Loading results...
      </div>
    );
  if (!session)
    return (
      <div className="min-h-screen bg-background pt-16 text-center text-xl text-destructive">
        Session not found
      </div>
    );

  const resultsList = [
    {
      name: "Blood Pressure",
      val: currentVitals.bloodPressureSystolic
        ? `${currentVitals.bloodPressureSystolic}/${currentVitals.bloodPressureDiastolic}`
        : null,
      unit: "mmHg",
      status: getBPStatus(
        currentVitals.bloodPressureSystolic,
        currentVitals.bloodPressureDiastolic,
      ),
      msg: getBPMessage(
        getBPStatus(
          currentVitals.bloodPressureSystolic,
          currentVitals.bloodPressureDiastolic,
        ),
      ),
    },
    {
      name: "Heart Rate",
      val: currentVitals.heartRate,
      unit: "bpm",
      status: getHRStatus(currentVitals.heartRate),
      msg: getHRMessage(getHRStatus(currentVitals.heartRate)),
    },
    {
      name: "SpO2 Oxygen",
      val: currentVitals.oxygenSaturation,
      unit: "%",
      status: getSpO2Status(currentVitals.oxygenSaturation),
      msg: getSpO2Message(getSpO2Status(currentVitals.oxygenSaturation)),
    },
    {
      name: "Body Temp",
      val: currentVitals.temperature,
      unit: "°C",
      status: getTempStatus(currentVitals.temperature),
      msg: getTempMessage(getTempStatus(currentVitals.temperature)),
    },
    {
      name: "Blood Glucose",
      val: currentVitals.bloodGlucose,
      unit: "mmol/L",
      status: getGlucoseStatus(currentVitals.bloodGlucose),
      msg: getGlucoseMessage(getGlucoseStatus(currentVitals.bloodGlucose)),
    },
    {
      name: "BMI",
      val: autoBMI,
      unit: "kg/m²",
      status: getBMIStatus(autoBMI),
      msg: getBMIMessage(getBMIStatus(autoBMI)),
    },
  ].filter((r) => r.val !== undefined && r.val !== null);

  return (
    <div className="min-h-screen bg-background flex flex-col pb-20">
      <KioskHeader
        title="Session Results"
        showBack
        backTo={`/session/${sessionId}`}
      />

      <main className="flex-1 p-4 max-w-3xl mx-auto w-full">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-success/20 text-success rounded-full mb-3">
            <CheckCircle className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-display font-bold text-foreground">
            Session Complete
          </h2>
          <p className="text-xl text-muted-foreground mt-2">
            Review the summary below for {session.patientName}
          </p>
        </div>

        <div className="bg-card rounded-xl shadow-xl border border-border overflow-hidden">
          <div className="divide-y divide-border/50">
            {resultsList.length === 0 ? (
              <div className="p-6 text-center text-base text-muted-foreground">
                No vitals recorded in this session.
              </div>
            ) : (
              resultsList.map((item, idx) => (
                <div
                  key={idx}
                  className="p-4 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <h4 className="text-xl font-bold text-foreground mb-1">
                      {item.name}
                    </h4>
                    <p
                      className={`text-sm font-medium ${
                        item.status === "normal"
                          ? "text-muted-foreground"
                          : "text-foreground"
                      }`}
                    >
                      {item.msg}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className="text-2xl font-display font-bold tracking-tight">
                        {item.val}
                      </span>
                      <span className="text-sm text-muted-foreground ml-1">
                        {item.unit}
                      </span>
                    </div>
                    <div
                      className={`w-2 h-12 rounded-full ${
                        getStatusColor(item.status).split(" ")[0]
                      }`}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-[0_-4px_15px_rgba(0,0,0,0.05)] p-3 z-10">
        <div className="max-w-3xl mx-auto flex gap-3">
          <button
            onClick={() => alert("Print functionality simulated.")}
            className="flex-1 h-12 bg-secondary text-secondary-foreground text-xl font-display font-bold rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Printer className="w-5 h-5" />
            Print Report
          </button>

          <button
            onClick={() => {
              // Manual reset
              queryClient.removeQueries({
                queryKey: [`/api/sessions/${sessionId}`],
              });
              setLocation("/");
            }}
            className="flex-[2] h-12 bg-primary text-primary-foreground text-xl font-display font-bold rounded-xl shadow-xl shadow-primary/25 active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Home className="w-5 h-5" />
            Returning to home in ( {countdown} ) s...
          </button>
        </div>
      </div>
    </div>
  );
}
// Helper messaging functions
function getBPMessage(s: VitalStatus) {
  if (s === "normal") return "Blood pressure is in the healthy range.";
  if (s === "warning")
    return "Elevated blood pressure detected. Monitor closely.";
  if (s === "critical")
    return "High blood pressure detected. Consult a physician.";
  return "Insufficient data.";
}
function getHRMessage(s: VitalStatus) {
  if (s === "normal") return "Heart resting rate is normal.";
  if (s === "warning") return "Heart rate is slightly outside normal range.";
  if (s === "critical") return "Abnormal heart rate detected.";
  return "Insufficient data.";
}
function getSpO2Message(s: VitalStatus) {
  if (s === "normal") return "Healthy blood oxygen levels.";
  if (s === "warning") return "Slightly low oxygen saturation.";
  if (s === "critical") return "Critical: Low oxygen levels detected.";
  return "Insufficient data.";
}
function getTempMessage(s: VitalStatus) {
  if (s === "normal") return "Body temperature is normal.";
  if (s === "warning") return "Slight variance in body temperature.";
  if (s === "critical") return "Fever or severe temperature variance detected.";
  return "Insufficient data.";
}
function getGlucoseMessage(s: VitalStatus) {
  if (s === "normal") return "Blood glucose is within target range.";
  if (s === "warning") return "Borderline blood glucose levels.";
  if (s === "critical") return "High or very low glucose detected.";
  return "Insufficient data.";
}
function getBMIMessage(s: VitalStatus) {
  if (s === "normal") return "Healthy weight range.";
  if (s === "warning") return "Outside of standard healthy weight range.";
  if (s === "critical") return "Indicates obesity risk category.";
  return "Insufficient data.";
}
