import { useLocation, useSearch } from "wouter";
import { useHistoryState } from "wouter/use-browser-location";
import { KioskHeader } from "@/components/KioskHeader";
import { ModalShell } from "@/components/ModalShell";
import { format } from "date-fns";
import {
  Printer,
  Home,
  CheckCircle,
  Activity,
  AlertCircle,
  AlertTriangle,
  AlertOctagon,
  ArrowLeft,
  Check,
  X,
} from "lucide-react";
import {
  getBPStatus,
  getHRStatus,
  getSpO2Status,
  getTempStatus,
  getBMIStatus,
  calculateBMI,
  VitalStatus,
  getStatusText,
} from "@/lib/vitals-utils";
import type { Vitals } from "@/types/vitals";
import { useMemo, useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useRateLimit } from "@/hooks/use-rate-limit";
// @ts-ignore - Session type from @workspace/api-zod
type Session = any;
export default function Results() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const navState = useHistoryState<{ token?: string; from?: string }>();

  const params = new URLSearchParams(
    search.startsWith("?") ? search.slice(1) : search,
  );
  const sessionToken = params.get("token") || navState?.token || "";
  const isSharedView = params.get("from") === "share";
  const returnTo =
    params.get("from") === "history" || navState?.from === "history"
      ? "/history"
      : "/";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { isRateLimited } = useRateLimit(1000);
  const [countdown, setCountdown] = useState(60);
  const [printCooldown, setPrintCooldown] = useState(false);
  const [showDoneConfirm, setShowDoneConfirm] = useState(false);

  const printMutation = useMutation({
    mutationFn: async (data: { sessionId: number; recommendation: string }) => {
      const res = await fetch("/api/print/receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Print failed");
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Receipt sent",
        description: "Report sent to thermal printer",
      });
    },
    onError: () => {
      toast({
        title: "Print failed",
        description: "Could not connect to printer",
        variant: "destructive",
      });
    },
  });

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
  });

  // Compute current vitals
  const currentVitals = useMemo<Vitals>(() => {
    if (!session?.vitals) return {};
    return session.vitals.reduce(
      (acc: Vitals, curr: Vitals) => ({ ...acc, ...curr }),
      {},
    );
  }, [session]);

  const autoBMI = calculateBMI(currentVitals.weight, currentVitals.height);

  // Create results list (MUST be before conditional returns)
  const resultsList = [
    (() => {
      const status = getBPStatus(
        currentVitals.bloodPressureSystolic,
        currentVitals.bloodPressureDiastolic,
      );
      return {
        name: "Blood Pressure",
        val: currentVitals.bloodPressureSystolic != null &&
          currentVitals.bloodPressureDiastolic != null
          ? `${currentVitals.bloodPressureSystolic}/${currentVitals.bloodPressureDiastolic}`
          : null,
        unit: "mmHg",
        status,
        msg: getBPMessage(
          status,
          currentVitals.bloodPressureSystolic,
          currentVitals.bloodPressureDiastolic,
        ),
      };
    })(),
    (() => {
      const status = getHRStatus(currentVitals.heartRate);
      return {
        name: "Heart Rate",
        val: currentVitals.heartRate,
        unit: "bpm",
        status,
        msg: getHRMessage(status, currentVitals.heartRate),
      };
    })(),
    (() => {
      const status = getSpO2Status(currentVitals.oxygenSaturation);
      return {
        name: "SpO2 Oxygen",
        val: currentVitals.oxygenSaturation,
        unit: "%",
        status,
        msg: getSpO2Message(status, currentVitals.oxygenSaturation),
      };
    })(),
    (() => {
      const status = getTempStatus(currentVitals.temperature);
      return {
        name: "Body Temp",
        val: currentVitals.temperature,
        unit: "°C",
        status,
        msg: getTempMessage(status, currentVitals.temperature),
      };
    })(),
    {
      name: "Weight",
      val: currentVitals.weight,
      unit: "kg",
      status: "unknown" as VitalStatus,
      msg: "Recorded value; no standalone screening category is assigned.",
    },
    {
      name: "Height",
      val: currentVitals.height,
      unit: "cm",
      status: "unknown" as VitalStatus,
      msg: "Recorded value; no standalone screening category is assigned.",
    },
    (() => {
      const status = getBMIStatus(autoBMI);
      return {
        name: "BMI",
        val: autoBMI,
        unit: "kg/m²",
        status,
        msg: getBMIMessage(status, session?.patientAge),
      };
    })(),
  ].filter((r) => r.val !== undefined && r.val !== null);

  // Use fixed screening rules so the on-screen and printed assessment agree.
  const overallRecommendation = useMemo(() => {
    const criticalCount = resultsList.filter((r) => r.status === "critical").length;
    const warningCount = resultsList.filter((r) => r.status === "warning").length;
    const assessedCount = resultsList.filter((r) => r.status !== "unknown").length;

    if (criticalCount > 0) {
      return {
        status: "critical",
        title: criticalCount === 1 ? "Critical-range measurement" : "Critical-range measurements",
        message: `${criticalCount} ${criticalCount === 1 ? "measurement crossed" : "measurements crossed"} a high-risk screening threshold. A single kiosk reading cannot confirm a diagnosis.`,
        action: "Repeat the measurement if safe. If it remains critical, or you have concerning symptoms, seek urgent medical care. Severe symptoms require emergency care.",
      };
    }
    if (warningCount > 0) {
      return {
        status: "warning",
        title: warningCount === 1 ? "Measurement needs attention" : "Measurements need attention",
        message: `${warningCount} ${warningCount === 1 ? "measurement is" : "measurements are"} outside the usual screening range.`,
        action: "Rest quietly and repeat the affected measurement using the correct technique. If it remains outside range, discuss it with a healthcare professional.",
      };
    }
    if (assessedCount === 0) {
      return {
        status: "unknown",
        title: "No classifiable measurements",
        message: "There are no measurements available for screening assessment.",
        action: "Record relevant measurements and review them with a healthcare professional.",
      };
    }
    return {
      status: "normal",
      title: "No out-of-range measurements detected",
      message: "The classifiable measurements are within the selected screening ranges. This does not rule out a health problem.",
      action: "Use these results as a screening snapshot, not a diagnosis. Repeat or seek clinical advice if you feel unwell.",
    };
  }, [resultsList]);

  const printAssessment = [
    overallRecommendation.title,
    overallRecommendation.message,
    `Action: ${overallRecommendation.action}`,
    "Recorded measurements:",
    ...resultsList.map(
      (item) =>
        `${item.name}: ${item.val} ${item.unit.replace("°", "")} - ${getStatusText(item.status)}. ${item.msg}`,
    ),
    "General adult screening thresholds are shown for all ages; pediatric results need age-specific clinical interpretation. The SpO2 value is an unvalidated screening estimate. This report is not a diagnosis.",
  ].join("\n");

  // Auto-reset the session after showing results (kiosk mode only)
  useEffect(() => {
    if (isSharedView) return;

    const interval = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    const timer = setTimeout(() => {
      queryClient.removeQueries({ queryKey: ["session", sessionToken] });

      // Redirect to home
      setLocation(returnTo);
    }, 60 * 1000); // 60 seconds display

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [sessionToken, returnTo, isSharedView]);

  if (isLoading)
    return (
      <div
        className="min-h-screen bg-background pt-16 text-center text-xl text-muted-foreground"
        style={{ minHeight: "100dvh" }}
      >
        Loading results...
      </div>
    );
  if (!session)
    return (
      <div
        className="min-h-screen bg-background pt-16 text-center"
        style={{ minHeight: "100dvh" }}
      >
        <div className="mx-auto max-w-md px-6">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <AlertCircle className="h-8 w-8" />
          </div>
          <h1 className="text-3xl font-display font-bold text-foreground">
            Report unavailable
          </h1>
          <p className="mt-2 text-lg text-muted-foreground">
            This session link is invalid or the report is no longer available.
          </p>
          <button
            onClick={() => {
              if (isRateLimited("home")) return;
              setLocation("/");
            }}
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-8 py-3 text-xl font-semibold text-primary-foreground hover:bg-primary/90"
          >
            Go to Home
          </button>
        </div>
      </div>
    );

  return (
    <div
      className="h-dvh bg-background flex flex-col"
    >
      <KioskHeader title="Session Results" />

      <main className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-[60rem] portrait:max-w-2xl mx-auto w-full p-4 pb-28">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 bg-success/20 text-success rounded-full mb-3">
            <CheckCircle className="w-6 h-6" />
          </div>
          <h2 className="text-2xl font-display font-bold text-foreground">
            Session Complete
          </h2>
          <h3 className="mt-1 text-3xl font-display font-bold text-foreground truncate">
            {session.patientName}
          </h3>
          <p className="mt-1 text-lg text-muted-foreground">
            {session.patientAge} years old •{" "}
            <span className="capitalize">{session.patientGender}</span>
          </p>
          <p className="text-base text-muted-foreground/80">
            {format(new Date(session.startedAt), "MMMM d, yyyy")} •{" "}
            {format(new Date(session.startedAt), "h:mm a")}
          </p>
        </div>

        <div className="mb-6 bg-card rounded-xl shadow-xl border border-border overflow-hidden">
          <div
            className={`p-4 border-b border-border ${
              overallRecommendation.status === "critical"
                ? "bg-destructive/10"
                : overallRecommendation.status === "warning"
                  ? "bg-yellow-500/10"
                  : "bg-primary/5"
            }`}
          >
            <h3 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              Screening Summary
            </h3>
            <p className="text-sm text-muted-foreground mt-0.5">
              General adult screening ranges are shown for all ages. Pediatric interpretation requires age-specific clinical references. SpO2 is an unvalidated screening estimate.
            </p>
          </div>
          <div className="p-6">
            <p className="text-lg font-bold text-foreground mb-2">
              {overallRecommendation.title}
            </p>
            <p className="text-lg text-foreground mb-4">
              {overallRecommendation.message}
            </p>
            <div
              className={`p-4 rounded-xl ${
                overallRecommendation.status === "critical"
                  ? "bg-destructive/5 border border-destructive/20"
                  : overallRecommendation.status === "warning"
                    ? "bg-yellow-500/5 border border-yellow-500/20"
                    : "bg-primary/5 border border-primary/20"
              }`}
            >
              <p className="text-base font-semibold text-foreground mb-1">
                Recommended Action:
              </p>
              <p className="text-base text-muted-foreground">
                {overallRecommendation.action}
              </p>
            </div>
            <p className="mt-4 text-base text-muted-foreground italic">
              These readings are for screening only, not diagnosis. Confirm concerns with a healthcare professional.
            </p>
          </div>
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
                  className="p-4 flex items-center justify-between gap-4"
                >
                  <div className="flex-1 min-w-0">
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

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <span className="text-2xl font-display font-bold tracking-tight">
                        {item.val}
                      </span>
                      <span className="text-sm text-muted-foreground ml-1">
                        {item.unit}
                      </span>
                    </div>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold ${
                        item.status === "normal"
                          ? "bg-success/10 text-success"
                          : item.status === "warning"
                            ? "bg-yellow-500/10 text-yellow-500"
                            : item.status === "critical"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {item.status === "normal" ? (
                        <Check className="w-4 h-4" />
                      ) : item.status === "warning" ? (
                        <AlertTriangle className="w-4 h-4" />
                      ) : item.status === "critical" ? (
                        <AlertOctagon className="w-4 h-4" />
                      ) : (
                        <Activity className="w-4 h-4" />
                      )}
                      {getStatusText(item.status)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-[0_-4px_15px_rgba(0,0,0,0.05)] p-4 z-10">
        <div className="max-w-[60rem] portrait:max-w-2xl mx-auto flex gap-3">
          <button
            onClick={() => {
              if (isRateLimited("print")) return;
              setPrintCooldown(true);
              setTimeout(() => setPrintCooldown(false), 5000);
              printMutation.mutate({
                sessionId: session?.id,
                recommendation: printAssessment,
              });
            }}
            disabled={printMutation.isPending || printCooldown}
            className="flex-1 h-16 bg-secondary text-secondary-foreground text-lg sm:text-xl md:text-2xl font-display font-bold rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Printer className="w-6 h-6" />
            {printMutation.isPending ? "Printing..." : printCooldown ? "Wait..." : "Print Report"}
          </button>

          {isSharedView ? (
            <button
              onClick={() => {
                if (isRateLimited("home")) return;
                if (window.history.length > 1) window.history.back();
                else setLocation("/");
              }}
              className="flex-[2] h-16 bg-primary text-primary-foreground text-lg sm:text-xl md:text-2xl font-display font-bold rounded-xl shadow-xl shadow-primary/25 flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-6 h-6" />
              Back
            </button>
          ) : (
            <button
              onClick={() => {
                if (isRateLimited("home")) return;
                setShowDoneConfirm(true);
              }}
              className="flex-[2] h-16 bg-primary text-primary-foreground text-lg sm:text-xl md:text-2xl font-display font-bold rounded-xl shadow-xl shadow-primary/25 flex items-center justify-center gap-2"
            >
              <Home className="w-6 h-6" />
              {returnTo === "/history"
                ? "Returning to history"
                : "Returning to home"}{" "}
              in ( {countdown} ) s...
            </button>
          )}
        </div>
      </div>

      <ModalShell
        open={showDoneConfirm}
        zIndex={70}
        backdrop="blur"
        panelClassName="bg-card rounded-3xl shadow-2xl p-8 w-full max-w-md border border-border/50"
      >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold">
                {returnTo === "/history"
                  ? "Return to history?"
                  : "Return to home?"}
              </h2>
              <button
                onClick={() => setShowDoneConfirm(false)}
                className="p-2 rounded-full hover:bg-muted"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-center text-muted-foreground mb-6">
              {returnTo === "/history"
                ? "Go back to the patient history list?"
                : "Leave this report and go back to the home screen?"}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (isRateLimited("home-confirm")) return;
                  setShowDoneConfirm(false);
                  queryClient.removeQueries({
                    queryKey: ["session", sessionToken],
                  });
                  setLocation(returnTo);
                }}
                className="flex-1 h-14 rounded-xl bg-primary text-primary-foreground text-lg font-semibold"
              >
                Yes
              </button>
              <button
                onClick={() => setShowDoneConfirm(false)}
                className="flex-1 h-14 rounded-xl bg-secondary text-lg font-semibold"
              >
                Cancel
              </button>
            </div>
      </ModalShell>
    </div>
  );
}
// Helper messaging functions
function getBPMessage(
  status: VitalStatus,
  systolic?: number | null,
  diastolic?: number | null,
) {
  if (status === "normal") return "Below 120/80 mmHg.";
  if (status === "critical") return "At least 180 systolic or 120 diastolic; repeat and seek urgent clinical advice.";
  if (status === "warning" && ((systolic ?? 0) < 90 || (diastolic ?? 0) < 60)) {
    return "Below the usual adult range; repeat and discuss persistent readings with a healthcare professional.";
  }
  if (status === "warning" && ((systolic ?? 0) >= 140 || (diastolic ?? 0) >= 90)) {
    return "High range; repeat correctly and discuss persistent readings with a healthcare professional.";
  }
  if (status === "warning") return "Above the usual adult range; repeat after resting.";
  return "Not assessed.";
}
function getHRMessage(status: VitalStatus, heartRate?: number | null) {
  if (status === "normal") return "Within the usual adult resting range (60-100 bpm).";
  if (status === "warning") return "Outside the usual adult resting range; repeat after sitting quietly.";
  if (status === "critical" && (heartRate ?? 0) < 40) return "Very low reading; repeat and seek urgent advice if it persists or you feel unwell.";
  if (status === "critical") return "Very high reading; repeat and seek urgent advice if it persists or you feel unwell.";
  return "Not assessed.";
}
function getSpO2Message(status: VitalStatus, spo2?: number | null) {
  if (status === "normal") return "At least 95%; pulse-oximeter screening estimate.";
  if (status === "warning") return "Below the usual range; recheck with warm, still fingers and confirm persistent results clinically.";
  if (status === "critical" && spo2 != null) return "90% or lower; recheck and seek urgent clinical advice, especially if you have symptoms.";
  return "Not assessed.";
}
function getTempMessage(status: VitalStatus, temp?: number | null) {
  if (status === "normal") return "Within the selected screening range (36.0-37.9 °C).";
  if (status === "warning" && temp != null && temp < 36) return "Below the selected screening range; repeat and seek advice if it persists.";
  if (status === "warning") return "Fever-range reading (38.0-39.9 °C); repeat and monitor symptoms.";
  if (status === "critical" && temp != null && temp < 35) return "Below 35 °C; repeat and seek urgent clinical advice.";
  if (status === "critical") return "At least 40 °C; seek urgent clinical advice, especially if unwell.";
  return "Not assessed.";
}
function getBMIMessage(status: VitalStatus, age?: number | null) {
  if (status === "normal") return "Within the adult BMI screening range (18.5-24.9).";
  if (status === "warning") {
    const pediatricNote = age != null && age < 18
      ? " For patients under 18, use age- and sex-specific growth charts."
      : "";
    return `Outside the adult BMI screening range; this is not a diagnosis.${pediatricNote}`;
  }
  return "Not assessed.";
}
