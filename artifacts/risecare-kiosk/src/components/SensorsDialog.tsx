import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

interface SensorsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

const sensors = [
  { id: "heartrate", name: "Heart Rate", icon: "❤️", unit: "bpm", key: "bpm" },
  { id: "spo2", name: "SpO2", icon: "🫁", unit: "%", key: "value" },
  { id: "height", name: "Height", icon: "📏", unit: "cm", key: "cm" },
  { id: "weight", name: "Weight", icon: "⚖️", unit: "kg", key: "kg" },
];

export function SensorsDialog({ isOpen, onClose }: SensorsDialogProps) {
  const { toast } = useToast();
  const [sessionId] = useState(() => `session-${Date.now()}`);
  const [enabledSensors, setEnabledSensors] = useState<Record<string, boolean>>(
    {},
  );
  const [testingSensors, setTestingSensors] = useState<Set<string>>(new Set());

  const isTesting = testingSensors.size > 0;

  useEffect(() => {
    const saved = localStorage.getItem("enabledSensors");
    if (saved) {
      setEnabledSensors(JSON.parse(saved));
    }
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
    enabled: false,
  });

  const { data: latestReadings } = useQuery({
    queryKey: ["latest-readings"],
    queryFn: async () => {
      const res = await fetch("/api/sensors/latest-readings");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: isOpen && isTesting,
    refetchInterval: isTesting ? 1000 : false,
  });

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
      if (!res.ok) throw new Error("Failed to send command");
      return res.json();
    },
    onSuccess: (_data, variables) => {
      if (variables.value === 2) {
        toast({
          title: "Calibration initiated",
          description: `Calibrating ${variables.sensor}... Check back shortly`,
        });
        setTimeout(() => refetchCalibration(), 3000);
      } else {
        setTimeout(() => refetchCalibration(), 3000);
      }
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send command",
        variant: "destructive",
      });
    },
  });

  const toggleSensor = (sensorId: string) => {
    const newState = { ...enabledSensors };
    newState[sensorId] = !newState[sensorId];
    saveEnabledState(newState);
  };

  const handleTestToggle = (sensorId: string) => {
    const isTestingThis = testingSensors.has(sensorId);
    const value = isTestingThis ? 0 : 1;

    commandMutation.mutate(
      { sensor: sensorId, value },
      {
        onSuccess: () => {
          setTestingSensors((prev) => {
            const next = new Set(prev);
            if (isTestingThis) {
              next.delete(sensorId);
            } else {
              next.add(sensorId);
            }
            return next;
          });
        },
      },
    );
  };

  const getReadingValue = (sensorId: string): string | null => {
    const reading = latestReadings?.[sensorId];
    if (!reading) return null;
    const sensor = sensors.find((s) => s.id === sensorId);
    if (!sensor) return null;
    const val = reading[sensor.key];
    return val != null ? `${val} ${sensor.unit}` : null;
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
                    className={
                      sensorStatus?.connected
                        ? "text-green-600"
                        : "text-red-600"
                    }
                  >
                    {sensorStatus?.connected ? "Connected" : "Disconnected"}
                  </span>
                </div>
              </div>
            </div>

            {/* Sensors Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {sensors.map((sensor) => {
                const isTestingThis = testingSensors.has(sensor.id);
                const readingValue = getReadingValue(sensor.id);

                return (
                  <div key={sensor.id} className="p-4 rounded-xl bg-secondary">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{sensor.icon}</span>
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
                        {(sensor.id === "height" || sensor.id === "weight") && calibrationResults?.[sensor.id] && (
                          <span className="text-xs text-muted-foreground bg-background/50 px-2 py-1 rounded-full">
                            {sensor.id === "height"
                              ? `${calibrationResults.height.totalHeight?.toFixed(1)} cm`
                              : `factor: ${calibrationResults.weight.factor?.toFixed(2)}`}
                          </span>
                        )}
                        <Button
                          onClick={() => toggleSensor(sensor.id)}
                          disabled={commandMutation.isPending}
                          variant={
                            enabledSensors[sensor.id] ? "default" : "outline"
                          }
                          size="sm"
                        >
                          {enabledSensors[sensor.id] ? "Enabled" : "Disabled"}
                        </Button>
                      </div>
                    </div>

                    {/* Live reading */}
                    {isTestingThis && (
                      <div className="mb-3 p-3 rounded-lg bg-background/50 border border-border/30">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Reading:</span>
                          <span className="text-xl font-bold text-primary">
                            {readingValue ?? (
                              <span className="flex items-center gap-1 text-sm font-normal text-muted-foreground">
                                <Loader2 className="w-3 h-3 animate-spin" />
                                Waiting...
                              </span>
                            )}
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 flex-wrap">
                      <Button
                        onClick={() =>
                          commandMutation.mutate({ sensor: sensor.id, value: 2 })
                        }
                        disabled={
                          commandMutation.isPending || !enabledSensors[sensor.id] || isTestingThis
                        }
                        variant="outline"
                        size="sm"
                      >
                        Calibrate
                      </Button>
                      <Button
                        onClick={() => handleTestToggle(sensor.id)}
                        disabled={
                          commandMutation.isPending || !enabledSensors[sensor.id]
                        }
                        variant={isTestingThis ? "destructive" : "secondary"}
                        size="sm"
                      >
                        {isTestingThis ? (
                          <span className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-destructive-foreground animate-pulse" />
                            Stop
                          </span>
                        ) : (
                          "Test"
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>

            <Button
              onClick={() => refetch()}
              className="w-full mt-4"
              variant="outline"
            >
              Refresh Status
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
