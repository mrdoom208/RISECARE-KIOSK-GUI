import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2, CheckCircle2, XCircle, HeartPulse, Wind, Ruler, Scale, Thermometer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

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

export function SensorsDialog({ isOpen, onClose }: SensorsDialogProps) {
  const { toast } = useToast();
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [enabledSensors, setEnabledSensors] = useState<Record<string, boolean>>({});
  const [feedback, setFeedback] = useState<Record<string, Feedback | null>>({});
  const testTimestamps = useRef<Record<string, number>>({});
  const calTimestamps = useRef<Record<string, number>>({});
  const feedbackTimers = useRef<Record<string, NodeJS.Timeout>>({});

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

  const { data: calibrationResults, refetch: refetchCalibration } = useQuery({
    queryKey: ["calibration-results"],
    queryFn: async () => {
      const res = await fetch("/api/sensors/calibration");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isOpen && hasPending,
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

  const clearFeedbackAfter = (sensorId: string, delay = 4000) => {
    if (feedbackTimers.current[sensorId]) clearTimeout(feedbackTimers.current[sensorId]);
    feedbackTimers.current[sensorId] = setTimeout(() => {
      setFeedback((prev) => ({ ...prev, [sensorId]: null }));
    }, delay);
  };

  const setSensorFeedback = (sensorId: string, fb: Feedback) => {
    setFeedback((prev) => ({ ...prev, [sensorId]: fb }));
  };

  // Check test results
  useEffect(() => {
    for (const sensorId of Object.keys(feedback)) {
      const fb = feedback[sensorId];
      if (fb?.type !== "test" || fb.status !== "pending") continue;

      const started = testTimestamps.current[sensorId];
      const elapsed = Date.now() - started;

      if (elapsed > TEST_TIMEOUT) {
        setSensorFeedback(sensorId, {
          type: "test",
          status: "fail",
          message: "Test timed out — no response from sensor",
        });
        clearFeedbackAfter(sensorId);
        continue;
      }

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
        clearFeedbackAfter(sensorId);
      }
    }
  }, [testResults, feedback]);

  // Check calibration results
  useEffect(() => {
    for (const sensorId of Object.keys(feedback)) {
      const fb = feedback[sensorId];
      if (fb?.type !== "calibrate" || fb.status !== "pending") continue;

      const started = calTimestamps.current[sensorId];
      const elapsed = Date.now() - started;

      if (elapsed > CAL_TIMEOUT) {
        setSensorFeedback(sensorId, {
          type: "calibrate",
          status: "fail",
          message: "Calibration timed out",
        });
        clearFeedbackAfter(sensorId, 12000);
        continue;
      }

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
        clearFeedbackAfter(sensorId, 12000);
      }
    }
  }, [calibrationResults, feedback]);

  const handleTest = (sensorId: string) => {
    testTimestamps.current[sensorId] = Date.now();
    setSensorFeedback(sensorId, {
      type: "test",
      status: "pending",
      message: "Testing sensor...",
    });
    commandMutation.mutate({ sensor: sensorId, value: 3 });
  };

  const handleCalibrate = (sensorId: string) => {
    calTimestamps.current[sensorId] = Date.now();
    setSensorFeedback(sensorId, {
      type: "calibrate",
      status: "pending",
      message: sensorId === "weight"
        ? "Clear the scale. The system will tare first, then ask for 1 kg."
        : "Make sure nothing is under the height sensor.",
    });
    commandMutation.mutate({
      sensor: sensorId,
      value: 2,
      knownWeightGrams: sensorId === "weight" ? 1000 : undefined,
    });
  };

  const toggleSensor = (sensorId: string) => {
    const newState = { ...enabledSensors };
    const enable = !newState[sensorId];
    if (sensorId === "heartrate") {
      newState["heartrate"] = enable;
      newState["spo2"] = enable;
    } else {
      newState[sensorId] = enable;
    }
    saveEnabledState(newState);
  };

  return (
    <AnimatePresence>
      {isOpen && (
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
            className="bg-card rounded-3xl shadow-2xl p-8 w-full max-w-2xl border border-border/50 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6">
              <button
                onClick={onClose}
                className="p-2 rounded-full hover:bg-muted transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
              <h2 className="text-2xl font-bold">Sensors</h2>
              <div className="w-10" />
            </div>

            {/* Status */}
            <div className="mb-6 p-4 rounded-xl bg-secondary">
              <div className="flex justify-between items-center">
                <div>
                  <p className="font-semibold">MQTT Status</p>
                </div>
                <div className="flex items-center gap-2">
                  {statusLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <div
                      className={`w-3 h-3 rounded-full ${sensorStatus?.connected ? "bg-green-500" : "bg-red-500"}`}
                    />
                  )}
                  <span
                    className={sensorStatus?.connected ? "text-green-600" : "text-red-600"}
                  >
                    {sensorStatus?.connected ? "Connected" : "Disconnected"}
                  </span>
                </div>
              </div>
            </div>

            {/* Sensors */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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

                return (
                  <div key={sensor.id} className="p-4 rounded-xl bg-secondary">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <SensorIcon className="w-6 h-6 text-primary" />
                        <h3 className="font-semibold">{sensor.name}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        {sensorStatus?.sensors?.[sensor.id] === false && (
                          <span className="text-xs text-red-500 bg-red-500/10 px-2 py-1 rounded-full">
                            Not detected
                          </span>
                        )}
                        {sensorStatus?.sensors?.[sensor.id] === true && (
                          <span className="text-xs text-green-500 bg-green-500/10 px-2 py-1 rounded-full">
                            Detected
                          </span>
                        )}
                        {(sensor.id === "height" || sensor.id === "weight") && calibrationResults?.[sensor.id]?.status === "ok" && !fb && (
                          <span className="text-xs text-muted-foreground bg-background/50 px-2 py-1 rounded-full">
                            {sensor.id === "height"
                              ? `${calibrationResults.height.totalHeight?.toFixed(1)} cm`
                              : `factor: ${calibrationResults.weight.factor?.toFixed(2)}`}
                          </span>
                        )}
                        <Button
                          onClick={() => toggleSensor(sensor.id)}
                          disabled={commandMutation.isPending && !fb}
                          variant={enabledSensors[sensor.id] ? "default" : "outline"}
                          size="sm"
                        >
                          {enabledSensors[sensor.id] ? "Enabled" : "Disabled"}
                        </Button>
                      </div>
                    </div>

                    {/* Feedback */}
                    {fb && (
                      <div
                        className={`mb-3 p-3 rounded-lg border ${
                          fb.status === "pending"
                            ? "bg-blue-500/10 border-blue-500/30"
                            : fb.status === "success"
                              ? "bg-green-500/10 border-green-500/30"
                              : "bg-red-500/10 border-red-500/30"
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {fb.status === "pending" && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                            {fb.status === "success" && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                            {fb.status === "fail" && <XCircle className="w-4 h-4 text-red-500" />}
                            <span
                              className={`text-sm font-medium ${
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
                          {fb.value && (
                            <span className="text-lg font-bold text-primary">{fb.value}</span>
                          )}
                          {fb.status === "pending" && fb.type === "test" && (
                            <span className="text-xs text-muted-foreground">timeout 12s</span>
                          )}
                          {fb.status === "pending" && fb.type === "calibrate" && (
                            <span className="text-xs text-muted-foreground">timeout 20s</span>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap">
                      {sensor.canCalibrate && (
                        <Button
                          onClick={() => handleCalibrate(sensor.id)}
                          disabled={
                            commandMutation.isPending ||
                            !enabledSensors[sensor.id] ||
                            fb?.status === "pending"
                          }
                          variant="outline"
                          size="sm"
                        >
                          Calibrate
                        </Button>
                      )}
                      <Button
                        onClick={() => handleTest(sensor.id)}
                        disabled={
                          commandMutation.isPending ||
                          !enabledSensors[sensor.id] ||
                          fb?.status === "pending"
                        }
                        variant="secondary"
                        size="sm"
                      >
                        Test
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button onClick={() => refetch()} className="w-full mt-4" variant="outline">
              Refresh Status
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
