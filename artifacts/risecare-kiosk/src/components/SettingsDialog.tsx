import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Check,
  Database,
  TestTube,
  FileText,
  ChevronRight,
  Loader2,
  Activity,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { SensorsDialog } from "./SensorsDialog";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const [step, setStep] = useState<"password" | "menu">("password");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
    const [activeSubmenu, setActiveSubmenu] = useState<
    "logs" | "database" | null
  >(null);
  const [showSensors, setShowSensors] = useState(false);

  const { data: sensorStatus, isLoading: statusLoading } = useQuery({
    queryKey: ["sensor-status"],
    queryFn: async () => {
      const res = await fetch("/api/sensors/status");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: step === "menu",
  });

  const { data: activityLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["activity-logs"],
    queryFn: async () => {
      const res = await fetch("/api/settings/logs");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: activeSubmenu === "logs",
  });

  const [account, setAccount] = useState<{ id: number; name: string } | null>(
    null,
  );

  const handlePasswordSubmit = async () => {
    try {
      const res = await fetch("/api/settings/verify-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: password }),
      });

      const data = await res.json();

      if (data.success) {
        setAccount(data.account);
        setStep("menu");
        setPassword("");
        setError("");
      } else {
        setError("Incorrect passcode");
        setPassword("");
      }
    } catch (e) {
      setError("Failed to verify passcode");
    }
  };

  const handleKeyPress = (num: string) => {
    if (password.length < 6) {
      setPassword((prev) => prev + num);
      setError("");
    }
  };

  const handlePasswordDelete = () => {
    setPassword((prev) => prev.slice(0, -1));
    setError("");
  };

  const handleClose = () => {
    setStep("password");
    setPassword("");
    setError("");
    setActiveSubmenu(null);
    onClose();
  };

  const handleActivityLogs = () => {
    setActiveSubmenu("logs");
  };

  const handleDatabase = () => {
    setActiveSubmenu("database");
  };

  const handleExport = () => {
    const url = new URL("/api/settings/export", window.location.origin);
    if (account) {
      url.searchParams.set("accountId", account.id.toString());
      url.searchParams.set("accountName", account.name);
    }
    window.open(url.toString(), "_blank");
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".db,.sqlite,.sqlite3";
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      const formData = new FormData();
      formData.append("file", file);
      if (account) {
        formData.append("accountId", account.id.toString());
        formData.append("accountName", account.name);
      }

      const res = await fetch("/api/settings/import", {
        method: "POST",
        body: formData,
      });

      if (res.ok) {
        console.log("Database imported successfully");
      } else {
        console.error("Failed to import database");
      }
    };
    input.click();
  };

  const handleDelete = () => {
    if (
      confirm(
        "Are you sure you want to delete all data? This cannot be undone.",
      )
    ) {
      const url = new URL("/api/settings/delete", window.location.origin);
      if (account) {
        url.searchParams.set("accountId", account.id.toString());
        url.searchParams.set("accountName", account.name);
      }
      fetch(url.toString(), { method: "POST" }).then((res) => {
        if (res.ok) console.log("Database deleted");
        else console.error("Failed to delete database");
      });
    }
  };

  return (
    <>
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
              className="bg-card rounded-3xl shadow-2xl p-8 w-full max-w-md border border-border/50 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <button
                  onClick={() => {
                    if (activeSubmenu) setActiveSubmenu(null);
                    else handleClose();
                  }}
                  className="p-2 rounded-full hover:bg-muted transition-colors"
                >
                  {activeSubmenu ? (
                    <ChevronRight className="w-6 h-6 rotate-180" />
                  ) : (
                    <X className="w-6 h-6" />
                  )}
                </button>
                <h2 className="text-2xl font-bold">
                  {activeSubmenu === "logs"
                    ? "Activity Logs"
                    : activeSubmenu === "database"
                      ? "Database"
                      : step === "password"
                        ? "Enter Password"
                        : "Settings"}
                </h2>
                <div className="w-10" />
              </div>

              {step === "password" ? (
                <>
                  <p className="text-center text-muted-foreground mb-4">
                    Enter 6-digit passcode
                  </p>
                  <div className="flex justify-center gap-2 mb-6">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="w-12 h-14 border-2 border-border rounded-lg flex items-center justify-center text-2xl font-bold"
                      >
                        {password[i] ? "•" : ""}
                      </div>
                    ))}
                  </div>

                  {error && (
                    <p className="text-red-500 text-center mb-4">{error}</p>
                  )}

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                      <button
                        key={num}
                        onClick={() => handleKeyPress(num.toString())}
                        className="h-16 text-2xl font-semibold bg-secondary rounded-xl active:scale-95 active:bg-primary active:text-primary-foreground transition-all"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      onClick={handlePasswordDelete}
                      className="h-16 flex items-center justify-center bg-muted rounded-xl active:scale-95 transition-all"
                    >
                      <X className="w-6 h-6" />
                    </button>
                    <button
                      onClick={() => handleKeyPress("0")}
                      className="h-16 text-2xl font-semibold bg-secondary rounded-xl active:scale-95 active:bg-primary active:text-primary-foreground transition-all"
                    >
                      0
                    </button>
                    <button
                      onClick={handlePasswordSubmit}
                      disabled={password.length !== 6}
                      className="h-16 flex items-center justify-center bg-primary text-white rounded-xl active:scale-95 disabled:opacity-50 transition-all"
                    >
                      <Check className="w-6 h-6" />
                    </button>
                  </div>
                </>
              ) : activeSubmenu === "logs" ? (
                <div>
                  {logsLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-8 h-8 animate-spin" />
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {activityLogs?.length > 0 ? (
                        activityLogs.map((log: any, i: number) => (
                          <div
                            key={i}
                            className="p-3 rounded-lg bg-secondary text-sm"
                          >
                            <div className="flex justify-between items-start">
                              <p className="font-semibold">
                                {log.action || "Unknown action"}
                              </p>
                              <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded-full">
                                {log.account_name || "Unknown"}
                              </span>
                            </div>
                            {log.details && (
                              <p className="text-muted-foreground text-xs mt-1">
                                {log.details}
                              </p>
                            )}
                            <p className="text-muted-foreground text-xs mt-1">
                              {log.created_at
                                ? new Date(log.created_at).toLocaleString()
                                : "Unknown time"}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground py-8">
                          No activity logs found
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : activeSubmenu === "database" ? (
                <div className="space-y-3">
                  <button
                    onClick={handleExport}
                    className="w-full flex items-center gap-3 p-4 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-left"
                  >
                    <FileText className="w-5 h-5" />
                    <span className="text-lg font-semibold">Export Database</span>
                  </button>
                  <button
                    onClick={handleImport}
                    className="w-full flex items-center gap-3 p-4 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors text-left"
                  >
                    <Database className="w-5 h-5" />
                    <span className="text-lg font-semibold">Import Database</span>
                  </button>
                  <button
                    onClick={handleDelete}
                    className="w-full flex items-center gap-3 p-4 rounded-xl bg-red-100 hover:bg-red-200 text-red-700 transition-colors text-left"
                  >
                    <FileText className="w-5 h-5" />
                    <span className="text-lg font-semibold">Delete All Data</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => setShowSensors(true)}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Activity className="w-5 h-5" />
                      <span className="text-lg font-semibold">Sensors</span>
                    </div>
                    <ChevronRight className="w-5 h-5" />
                  </button>

                  <button
                    onClick={handleActivityLogs}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5" />
                      <span className="text-lg font-semibold">Activity Log</span>
                    </div>
                    <ChevronRight className="w-5 h-5" />
                  </button>

                  <button
                    onClick={handleDatabase}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <Database className="w-5 h-5" />
                      <span className="text-lg font-semibold">Database</span>
                    </div>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <SensorsDialog
        isOpen={showSensors}
        onClose={() => setShowSensors(false)}
      />
    </>
  );
}
