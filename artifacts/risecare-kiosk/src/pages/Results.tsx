import { useRoute, useLocation } from "wouter";
import { KioskHeader } from "@/components/KioskHeader";
import {
  Printer,
  Home,
  CheckCircle,
  Activity,
  AlertCircle,
  Check,
} from "lucide-react";
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
import { useMemo, useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
// @ts-ignore - Session type from @workspace/api-zod
type Session = any;
export default function Results() {
  const [, params] = useRoute("/session/:token/results");
  const [, setLocation] = useLocation();
  const sessionToken = params?.token || "";
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [countdown, setCountdown] = useState(60);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const aiCalledRef = useRef(false);

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
        val: currentVitals.bloodPressureSystolic
          ? `${currentVitals.bloodPressureSystolic}/${currentVitals.bloodPressureDiastolic}`
          : null,
        unit: "mmHg",
        status,
        msg: getBPMessage(status),
      };
    })(),
    (() => {
      const status = getHRStatus(currentVitals.heartRate);
      return {
        name: "Heart Rate",
        val: currentVitals.heartRate,
        unit: "bpm",
        status,
        msg: getHRMessage(status),
      };
    })(),
    (() => {
      const status = getSpO2Status(currentVitals.oxygenSaturation);
      return {
        name: "SpO2 Oxygen",
        val: currentVitals.oxygenSaturation,
        unit: "%",
        status,
        msg: getSpO2Message(status),
      };
    })(),
    (() => {
      const status = getTempStatus(currentVitals.temperature);
      return {
        name: "Body Temp",
        val: currentVitals.temperature,
        unit: "°C",
        status,
        msg: getTempMessage(status),
      };
    })(),
    (() => {
      const status = getGlucoseStatus(currentVitals.bloodGlucose);
      return {
        name: "Blood Glucose",
        val: currentVitals.bloodGlucose,
        unit: "mmol/L",
        status,
        msg: getGlucoseMessage(status),
      };
    })(),
    {
      name: "Weight",
      val: currentVitals.weight,
      unit: "kg",
      status: "normal" as VitalStatus,
      msg: "Recorded body weight.",
    },
    {
      name: "Height",
      val: currentVitals.height,
      unit: "cm",
      status: "normal" as VitalStatus,
      msg: "Recorded body height.",
    },
    (() => {
      const status = getBMIStatus(autoBMI);
      return {
        name: "BMI",
        val: autoBMI,
        unit: "kg/m²",
        status,
        msg: getBMIMessage(status),
      };
    })(),
  ].filter((r) => r.val !== undefined && r.val !== null);

  // AI Overall Recommendation with varied advice (MUST be before conditional returns)
  const overallRecommendation = useMemo(() => {
    const criticalCount = resultsList.filter(
      (r) => r.status === "critical",
    ).length;
    const warningCount = resultsList.filter(
      (r) => r.status === "warning",
    ).length;
    const normalCount = resultsList.filter((r) => r.status === "normal").length;

    // Check specific conditions for varied advice
    const hasCriticalBP = resultsList.find(
      (r) => r.name === "Blood Pressure" && r.status === "critical",
    );
    const hasCriticalHR = resultsList.find(
      (r) => r.name === "Heart Rate" && r.status === "critical",
    );
    const hasCriticalSpO2 = resultsList.find(
      (r) => r.name === "SpO2 Oxygen" && r.status === "critical",
    );
    const hasCriticalTemp = resultsList.find(
      (r) => r.name === "Body Temp" && r.status === "critical",
    );
    const hasCriticalGlucose = resultsList.find(
      (r) => r.name === "Blood Glucose" && r.status === "critical",
    );

    const hasWarningBP = resultsList.find(
      (r) => r.name === "Blood Pressure" && r.status === "warning",
    );
    const hasWarningBMI = resultsList.find(
      (r) => r.name === "BMI" && r.status === "warning",
    );
    const hasHighBMI = resultsList.find(
      (r) => r.name === "BMI" && r.status === "critical",
    );

    if (criticalCount > 0) {
      // Emergency / Clinic Visit
      if (
        hasCriticalSpO2 ||
        (hasCriticalTemp && (currentVitals.temperature ?? 0) > 39)
      ) {
        return {
          status: "critical",
          title: "🚨 Emergency: Seek Immediate Care",
          message:
            "Critical oxygen levels or high fever detected. This requires emergency medical attention.",
          action:
            "Go to the nearest emergency room or call emergency services (911) immediately. Do not wait.",
        };
      }

      if (hasCriticalBP) {
        return {
          status: "critical",
          title: "🏥 Clinic Visit Required",
          message:
            "Your blood pressure is dangerously high. This needs immediate medical evaluation.",
          action:
            "Visit an urgent care clinic or hospital today. Avoid strenuous activity until cleared by a doctor.",
        };
      }

      if (hasCriticalHR) {
        return {
          status: "critical",
          title: "🏥 Clinic Visit Required",
          message:
            "Your heart rate is at a critical level requiring medical assessment.",
          action:
            "Schedule an appointment with a cardiologist within 24 hours. Avoid caffeine and stress.",
        };
      }

      if (hasCriticalGlucose) {
        return {
          status: "critical",
          title: "🏥 Medical Attention Needed",
          message:
            "Your blood glucose is at dangerous levels (hypoglycemia or hyperglycemia).",
          action:
            "Visit an urgent care clinic immediately. Bring a snack if hypoglycemic, or seek diabetes management if hyperglycemic.",
        };
      }

      return {
        status: "critical",
        title: "⚠️ Immediate Medical Attention Recommended",
        message: `You have ${criticalCount} critical reading(s). Please consult a healthcare professional as soon as possible.`,
        action:
          "Schedule an appointment with your doctor immediately and bring this report.",
      };
    }

    if (warningCount >= 2) {
      // Retake instructions + Lifestyle suggestion
      if (hasWarningBP) {
        return {
          status: "warning",
          title: "⚠️ Blood Pressure Elevated",
          message:
            "Your blood pressure is above normal. This could be due to stress, salt intake, or lack of exercise.",
          action:
            "Retake your BP after 15 minutes of rest in a quiet room. Reduce salt intake and practice stress management (meditation, walking).",
        };
      }

      if (hasHighBMI) {
        return {
          status: "warning",
          title: "⚠️ Weight Management Needed",
          message:
            "Your BMI indicates you're in an obesity risk category. Lifestyle changes can help.",
          action:
            "Consult a nutritionist for a personalized meal plan. Aim for 150 minutes of moderate exercise per week (walking, swimming).",
        };
      }

      return {
        status: "warning",
        title: "⚠️ Multiple Values Need Monitoring",
        message: `You have ${warningCount} readings outside normal range. Monitor these trends closely.`,
        action:
          "Book a check-up within the next week. Bring this report and discuss lifestyle changes with your doctor.",
      };
    }

    if (warningCount === 1) {
      // Hydration / Rest advice
      const hasLowBP = resultsList.find(
        (r) =>
          r.name === "Blood Pressure" &&
          r.status === "warning" &&
          (currentVitals.bloodPressureSystolic ?? 0) < 100,
      );
      const hasHighHR = resultsList.find(
        (r) =>
          r.name === "Heart Rate" &&
          r.status === "warning" &&
          (currentVitals.heartRate ?? 0) > 100,
      );
      const hasLowSpO2 = resultsList.find(
        (r) => r.name === "SpO2 Oxygen" && r.status === "warning",
      );

      if (hasLowBP) {
        return {
          status: "warning",
          title: "⚠️ Low Blood Pressure Detected",
          message:
            "Your blood pressure is lower than normal. This can cause dizziness or fatigue.",
          action:
            "Increase hydration (drink 2-3 glasses of water now). Rest for 20 minutes with your feet elevated. Eat a salty snack if feeling faint.",
        };
      }

      if (hasHighHR) {
        return {
          status: "warning",
          title: "⚠️ Elevated Heart Rate",
          message:
            "Your heart rate is above normal resting range. This could be due to stress, caffeine, or dehydration.",
          action:
            "Rest for 10-15 minutes in a calm environment. Drink water and avoid caffeine for the next 4 hours. Retake measurement after resting.",
        };
      }

      if (hasLowSpO2) {
        return {
          status: "warning",
          title: "⚠️ Low Oxygen Saturation",
          message:
            "Your oxygen levels are slightly below optimal. This may indicate respiratory issues.",
          action:
            "Practice deep breathing exercises (inhale 4 sec, hold 4 sec, exhale 4 sec). Avoid smoking and polluted areas. Retake after 10 minutes of fresh air.",
        };
      }

      return {
        status: "warning",
        title: "⚠️ One Reading Needs Attention",
        message:
          "One of your vital signs is slightly outside the normal range.",
        action:
          "Retake this measurement in a few days to see if it was a temporary fluctuation.",
      };
    }

    if (normalCount === resultsList.length && resultsList.length >= 4) {
      return {
        status: "normal",
        title: "✅ All Vitals Looking Great!",
        message:
          "All your vital signs are within healthy ranges. Excellent work maintaining your health!",
        action:
          "Keep up your healthy habits! Continue regular check-ups every 6-12 months. Stay hydrated and keep active.",
      };
    }

    return {
      status: "normal",
      title: "✅ Generally Healthy",
      message:
        "Most of your readings are within normal ranges. You're doing well!",
      action:
        "Maintain a balanced diet, stay physically active, and monitor your health regularly.",
    };
  }, [resultsList, currentVitals]);

  const fetchAiRecommendation = useCallback(async () => {
    if (!session?.vitals) return;
    setAiLoading(true);
    setAiError(false);
    setDisplayedText(""); // Clear previous text

    try {
      console.log("[AI Debug] Sending request");
      const r = await fetch("/api/ai/recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vitals: currentVitals }),
      });

      console.log("[AI Debug] Response status:", r.status, "content-type:", r.headers.get("content-type"));
      if (r.headers.get("content-type")?.includes("text/event-stream")) {
        const reader = r.body?.getReader();
        if (!reader) throw new Error("No response stream");
        const decoder = new TextDecoder();

        while (true) {
          const { done, value } = await reader.read();
          if (done) {
            console.log("[AI Debug] Stream done");
            break;
          }

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split("\n");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.chunk) {
                  console.log("[AI Debug] Chunk:", JSON.stringify(data.chunk));
                  setDisplayedText((prev) => prev + data.chunk);
                }
              } catch (e) {
                console.error("JSON parse error", e);
              }
            }
          }
        }
      } else {
        // Fallback for non-streaming JSON response
        const data = await r.json();
        console.log("[AI Debug] Fallback response:", data);
        setDisplayedText(data.recommendation || "");
      }
    } catch (e) {
      setAiError(true);
      console.error(e);
    } finally {
      setAiLoading(false);
    }
  }, [session, currentVitals]);

  useEffect(() => {
    const hasVitals = Object.keys(currentVitals).length > 0;
    if (
      !hasVitals ||
      displayedText ||
      aiLoading ||
      aiCalledRef.current
    )
      return;
    aiCalledRef.current = true;
    fetchAiRecommendation();
  }, [
    currentVitals,
    displayedText,
    sessionToken,
    fetchAiRecommendation,
    aiLoading,
  ]);

  // Auto-reset the session after showing results (kiosk mode)
  useEffect(() => {
    const interval = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    const timer = setTimeout(() => {
      queryClient.removeQueries({ queryKey: [`/api/sessions/token`] });

      // Redirect to home
      setLocation("/");
    }, countdown * 1000); // 20 seconds display

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
  }, [sessionToken, countdown]);

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
        className="min-h-screen bg-background pt-16 text-center text-xl text-destructive"
        style={{ minHeight: "100dvh" }}
      >
        Session not found
      </div>
    );

  return (
    <div
      className="min-h-screen bg-background flex flex-col pb-20"
      style={{ minHeight: "100dvh" }}
    >
      <KioskHeader title="Session Results" />

      <main className="flex-1 p-4 max-w-2xl mx-auto w-full">
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

        {/* AI Overall Recommendation */}
        <div className="mb-6 bg-card rounded-xl shadow-xl border border-border overflow-hidden">
          <div
            className={`p-4 border-b border-border ${
              aiLoading && !displayedText ? "bg-primary/5" : "bg-primary/5"
            }`}
          >
            <h3 className="text-xl font-display font-bold text-foreground flex items-center gap-2">
              <Activity className="w-5 h-5 text-primary" />
              {aiLoading && !displayedText
                ? "AI Analyzing..."
                : "AI Health Assessment"}
            </h3>
          </div>
          <div className="p-6">
            <p className="text-lg text-foreground mb-4 leading-relaxed whitespace-pre-wrap min-h-[2em]">
              {displayedText ||
                (aiLoading && !aiError
                  ? "Generating personalized recommendation..."
                  : "No AI assessment available.")}
              {aiLoading && !aiError && (
                <span className="inline-block w-0.5 h-5 bg-primary ml-0.5 animate-pulse" />
              )}
            </p>
            {!aiLoading && displayedText && (
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-base text-muted-foreground italic">
                  Note: This is an automated assessment based on your recorded
                  vitals. Please consult a healthcare professional for proper
                  medical advice.
                </p>
              </div>
            )}
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
            onClick={() =>
              printMutation.mutate({
                sessionId: session?.id,
                recommendation: overallRecommendation?.message ?? "",
              })
            }
            className="flex-1 h-12 bg-secondary text-secondary-foreground text-xl font-display font-bold rounded-xl active:scale-95 transition-all flex items-center justify-center gap-2"
          >
            <Printer className="w-5 h-5" />
            Print Report
          </button>

          <button
            onClick={() => {
              // Manual reset
              queryClient.removeQueries({
                queryKey: [`/api/sessions/token`],
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
