import { useState, useEffect, useRef } from "react";
import { ArrowLeft, Loader2, CheckCircle2, XCircle, HeartPulse, Ruler, Scale, Thermometer, Zap, RefreshCw, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useRateLimit } from "@/hooks/use-rate-limit";

interface SensorsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const sensors = [
  { id: "heartrate", name: "Heart Rate & SpO2", icon: HeartPulse, unit: "bpm", key: "bpm", decimals: 0, canCalibrate: false },
  { id: "height", name: "Height", icon: Ruler, unit: "cm", key: "cm", decimals: 1, canCalibrate: true },
  { id: "weight", name: "Weight", icon: Scale, unit: "kg", key: "kg", decimals: 2, canCalibrate: true },
  { id: "temperature", name: "Temperature", icon: Thermometer, unit: "°C", key: "celsius", decimals: 1, canCalibrate: false },
];

type Feedback = {
  type: "test" | "calibrate";
  status: "pending" | "success" | "fail";
  message: string;
  value?: string;
};

const TEST_TIMEOUT = 12000;
const CAL_TIMEOUT = 20000;
const RATE_LIMIT_MS = 2000;

export function SensorsDialog({ isOpen, onClose }: SensorsDialogProps) {
  const { toast } = useToast();
  const { isRateLimited: isGloballyRateLimited } = useRateLimit(1000);
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [enabledSensors, setEnabledSensors] = useState<Record<string, boolean>>({});
  const [confirmReset, setConfirmReset] = useState(false);
  const [printFeedback, setPrintFeedback] = useState<Feedback | null>(null);
  const [doneCooldown, setDoneCooldown] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, Feedback | null>>({});
  const testTimestamps = useRef<Record<string, number>>({});
  const calTimestamps = useRef<Record<string, number>>({});
  const feedbackTimers = useRef<Record<string, NodeJS.Timeout>>({});
  const lastAction = useRef<Record<string, number>>({});
  const isRateLimited = (sensorId: string) => {
    const last = lastAction.current[sensorId];
    return last != null && Date.now() - last < RATE_LIMIT_MS;
  };

  const hasPending = Object.values(feedback).some((f) => f?.status === "pending");

  useEffect(() => {
    const saved = localStorage.getItem("enabledSensors");
    if (saved) setEnabledSensors(JSON.parse(saved));
  }, []);

  const saveEnabledState = (state: Record<string, boolean>) => {
    localStorage.setItem("enabledSensors", JSON.stringify(state));
    setEnabledSensors(state);
    window.dispatchEvent(new Event("sensorStateChange"));
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
    refetchInterval: isOpen ? 5000 : false,
  });

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

  const { data: testResults } = useQuery({
    queryKey: ["test-results"],
    queryFn: async () => {
      const res = await fetch("/api/sensors/test-results");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isOpen && hasPending,
    refetchInterval: hasPending ? 1000 : false,
  });

  const commandMutation = useMutation({
    mutationFn: async ({
      sensor,
      value,
      knownWeightGrams,
    }: {
      sensor: string;
      value: number;
      knownWeightGrams?: number;
    }) => {
      const res = await fetch("/api/sensors/command", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sensor, value, knownWeightGrams }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send command",
        variant: "destructive",
      });
    },
  });

  const testAllMutation = useMutation({
    mutationFn: async (sensorIds: string[]) => {
      const res = await fetch("/api/sensors/test-all", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, sensors: sensorIds }),
      });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to start test all",
        variant: "destructive",
      });
    },
  });

  const { data: testAllResults } = useQuery({
    queryKey: ["test-all-results"],
    queryFn: async () => {
      const res = await fetch("/api/sensors/test-all-results");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isOpen && hasPending,
    refetchInterval: hasPending ? 1000 : false,
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

          if (fb.type === "test") {
            const started = testTimestamps.current[sensorId];
            if (now - started > TEST_TIMEOUT) {
              next[sensorId] = { type: "test", status: "fail", message: "Test timed out — no response from sensor" };
              changed = true;
            }
          } else if (fb.type === "calibrate") {
            const started = calTimestamps.current[sensorId];
            if (now - started > CAL_TIMEOUT) {
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

  // Check test results
  useEffect(() => {
    for (const sensorId of Object.keys(feedback)) {
      const fb = feedback[sensorId];
      if (fb?.type !== "test" || fb.status !== "pending") continue;

      const started = testTimestamps.current[sensorId];
      const result = testResults?.[sensorId];
      if (result && result._receivedAt > started) {
        if (result.status === "success") {
          const sensor = sensors.find((s) => s.id === sensorId);
          if (!sensor) continue;
          const val = result[sensor.key];
          setSensorFeedback(sensorId, {
            type: "test",
            status: "success",
            message: `Test successful`,
            value: val != null ? `${Number(val).toFixed(sensor.decimals)} ${sensor.unit}` : undefined,
          });
        } else {
          setSensorFeedback(sensorId, {
            type: "test",
            status: "fail",
            message: "Test failed — sensor returned error",
          });
        }
      }
    }
  }, [testResults, feedback]);

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
            : `factor=${Number(result.factor).toFixed(2)}`;
          const message = isHeight
            ? `Saved height calibration ${value}`
            : `Saved weight calibration ${value}`;
          setSensorFeedback(sensorId, {
            type: "calibrate",
            status: "success",
            message,
          });
          toast({
            title: "Calibration saved",
            description: message,
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
    testTimestamps.current[sensorId] = Date.now();
    setSensorFeedback(sensorId, {
      type: "test",
      status: "pending",
      message: "Testing sensor...",
    });
    commandMutation.mutate({ sensor: sensorId, value: 3 });
  };

  const handleTestAll = () => {
    const enabledIds = sensors.filter((s) => enabledSensors[s.id]).map((s) => s.id);
    if (enabledIds.length === 0) {
      toast({
        title: "No sensors enabled",
        description: "Enable at least one sensor to test",
        variant: "destructive",
      });
      return;
    }
    enabledIds.forEach((id) => {
      testTimestamps.current[id] = Date.now();
      setSensorFeedback(id, {
        type: "test",
        status: "pending",
        message: "Testing sensor...",
      });
    });
    testAllMutation.mutate(enabledIds);
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
      message: isWeight ? "Clearing scale..." : "Measuring height...",
    });
    commandMutation.mutate({
      sensor: sensorId,
      value: 2,
      knownWeightGrams: isWeight ? 1000 : undefined,
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
      knownWeightGrams: sensorId === "weight" ? 1000 : undefined,
    });
  };

  const isWaitingForWeight =
    feedback["weight"]?.type === "calibrate" &&
    feedback["weight"]?.status === "pending" &&
    calibrationProgress?.weight?.message?.startsWith("Tare done");

  const isWaitingForHeight =
    feedback["height"]?.type === "calibrate" &&
    feedback["height"]?.status === "pending" &&
    calibrationProgress?.height?.message?.startsWith("Height measured");

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

  const printerStatus = sensorStatus?.sensors?.printer as
    | { connected?: boolean; paper?: boolean }
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

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
          style={{ paddingBottom: "calc(1rem + var(--vk-height, 0px))" }}
        >
          <div className="bg-card rounded-3xl shadow-2xl p-5 sm:p-6 md:p-10 w-full max-w-5xl border border-border/50 max-h-[90vh] overflow-y-auto">
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
                const detected = sensorStatus?.sensors?.[sensor.id];
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
                      {detected === false && (
                        <Badge variant="destructive" className="shrink-0 px-3 py-1.5 text-sm">
                          Not detected
                        </Badge>
                      )}
                      {detected === true && (
                        <Badge
                          variant="outline"
                          className="shrink-0 px-3 py-1.5 text-sm text-green-600 border-green-500/30 bg-green-500/10"
                        >
                          Detected
                        </Badge>
                      )}
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
                        disabled={commandMutation.isPending || !sensorStatus?.connected}
                        className="flex-1 min-w-0 text-left disabled:opacity-50"
                      >
                        <p className="text-base font-medium">Sensor enabled</p>
                        {calibrationSaved && (
                          <p className="text-sm text-muted-foreground truncate">
                            {sensor.id === "height"
                              ? `Calibrated ${calibrationResults.height.totalHeight?.toFixed(1)} cm`
                              : `Calibrated · factor ${calibrationResults.weight.factor?.toFixed(2)}`}
                          </p>
                        )}
                      </button>
                      <Switch
                        checked={!!enabledSensors[sensor.id]}
                        onCheckedChange={(checked) => {
                          if (isGloballyRateLimited("toggle-" + sensor.id)) return;
                          toggleSensor(sensor.id, checked === true);
                        }}
                        disabled={commandMutation.isPending || !sensorStatus?.connected}
                        className="h-8 w-[52px] shrink-0 [&>span]:h-6! [&>span]:w-6! [&>span]:data-[state=checked]:translate-x-6! [&>span]:data-[state=unchecked]:translate-x-0!"
                      />
                    </div>

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
                            {fb.status === "pending" && fb.type === "test" && (
                              <span className="text-sm text-muted-foreground">timeout 12s</span>
                            )}
                            {fb.status === "pending" && fb.type === "calibrate" && (
                              <span className="text-sm text-muted-foreground">timeout 20s</span>
                            )}
                          </div>
                        </div>
                        {sensor.id === "weight" && isWaitingForWeight && (
                          <Button
                            onClick={() => handleFinalizeCalibrate("weight")}
                            disabled={commandMutation.isPending || doneCooldown["weight"]}
                            className="mt-3 w-full h-12 text-base"
                            size="lg"
                          >
                            Done — weight placed
                          </Button>
                        )}
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
                {!printerStatus?.connected ? (
                  <Badge variant="destructive" className="shrink-0 px-3 py-1.5 text-sm">
                    Not detected
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
                  disabled={commandMutation.isPending || !printerStatus?.connected}
                  className="flex-1 min-w-0 text-left disabled:opacity-50"
                >
                  <p className="text-base font-medium">Printer enabled</p>
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
                  disabled={commandMutation.isPending || !printerStatus?.connected}
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
                onClick={() => { if (isGloballyRateLimited("refresh")) return; refetch(); }}
                variant="outline"
                size="lg"
                className="sm:flex-1 h-12 text-base"
              >
                <RefreshCw className="w-5 h-5" />
                Refresh Status
              </Button>
              <Button
                onClick={handleTestAll}
                disabled={testAllMutation.isPending || hasPending || !sensorStatus?.connected}
                size="lg"
                className="sm:flex-[1.5] h-12 text-base"
              >
                {testAllMutation.isPending ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <Zap className="w-5 h-5" />
                )}
                Test All Sensors
              </Button>
            </div>

            {/* Test All Summary */}
            {testAllResults?.completed && testAllResults?.summary && (
              <div className="mt-5 p-5 rounded-2xl border border-border/60 bg-secondary/40">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <p className="text-lg font-semibold">Test Summary</p>
                  <span className="text-sm text-muted-foreground text-right">Published to risecare/test/summary</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.entries(testAllResults.summary).map(([sensor, status]) => (
                    <div key={sensor} className="flex items-center gap-2">
                      {status === "working" ? (
                        <CheckCircle2 className="w-5 h-5 text-green-500" />
                      ) : (
                        <XCircle className="w-5 h-5 text-red-500" />
                      )}
                      <span className="text-base capitalize font-medium">{sensor}</span>
                      <span
                        className={`ml-auto text-sm ${status === "working" ? "text-green-600" : "text-red-600"}`}
                      >
                        {status === "working" ? "Working" : "Not working"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

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
          </div>
        </div>
      )}
    </>
  );
}
