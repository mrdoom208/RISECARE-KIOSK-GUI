import { useState } from "react";
import {
  X,
  Check,
  Database,
  FileText,
  ChevronRight,
  Loader2,
  Activity,
  Printer,
  Shield,
  UserPlus,
  List,
  Brain,
  Cpu,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { SensorsDialog } from "./SensorsDialog";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<"password" | "menu" | "create-admin">("password");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [activeSubmenu, setActiveSubmenu] = useState<
    "logs" | "database" | "admin-accounts" | "ai-integration" | null
  >(null);
  const [showSensors, setShowSensors] = useState(false);

  const [adminName, setAdminName] = useState("");
  const [adminPasscode, setAdminPasscode] = useState("");
  const [adminRetryPasscode, setAdminRetryPasscode] = useState("");
  const [adminActiveField, setAdminActiveField] = useState<"passcode" | "retry">("passcode");
  const [adminError, setAdminError] = useState("");

  const [pendingAction, setPendingAction] = useState<"export" | "import" | "delete" | null>(null);
  const [actionPasscode, setActionPasscode] = useState("");
  const [actionError, setActionError] = useState("");

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

  const { data: adminAccounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["admin-accounts"],
    queryFn: async () => {
      const res = await fetch("/api/settings/accounts");
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json() as Promise<{ id: number; name: string; passcode: string; created_at: string }[]>;
    },
    enabled: activeSubmenu === "admin-accounts",
  });

  const { data: aiMode, isLoading: aiModeLoading } = useQuery({
    queryKey: ["ai-mode"],
    queryFn: async () => {
      const res = await fetch("/api/settings/ai-mode");
      if (!res.ok) throw new Error("Failed to fetch AI mode");
      const data = await res.json();
      return data.mode as string;
    },
    enabled: activeSubmenu === "ai-integration",
  });

  const setAiModeMutation = useMutation({
    mutationFn: async (mode: string) => {
      let url = "/api/settings/ai-mode";
      if (account) {
        url += `?accountId=${account.id}&accountName=${encodeURIComponent(account.name)}`;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error("Failed to set AI mode");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-mode"] });
      toast({ title: "AI mode updated" });
    },
    onError: () => {
      toast({ title: "Failed to update AI mode", variant: "destructive" });
    },
  });

  const [account, setAccount] = useState<{ id: number; name: string } | null>(null);

  const printTestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/print/test", { method: "POST" });
      if (!res.ok) throw new Error("Print test failed");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Print test sent", description: "Test page sent to printer" });
    },
    onError: () => {
      toast({ title: "Print test failed", description: "Could not connect to printer", variant: "destructive" });
    },
  });

  const createAdminMutation = useMutation({
    mutationFn: async (data: { name: string; passcode: string }) => {
      const res = await fetch("/api/settings/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name, passcode: data.passcode, role: "admin" }),
      });
      if (!res.ok) {
        let msg = "Failed to create admin";
        try {
          const err = await res.json();
          msg = err.error || err.message || msg;
        } catch {
          msg = `Server error (${res.status})`;
        }
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Admin created", description: "New admin account has been created" });
      setAdminName("");
      setAdminPasscode("");
      setAdminRetryPasscode("");
      setStep("menu");
    },
    onError: (err: Error) => {
      setAdminError(err.message);
    },
  });

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

  const handleAdminKeyPress = (num: string) => {
    setAdminError("");
    if (adminActiveField === "passcode" && adminPasscode.length < 6) {
      setAdminPasscode((prev) => prev + num);
    } else if (adminActiveField === "retry" && adminRetryPasscode.length < 6) {
      setAdminRetryPasscode((prev) => prev + num);
    }
  };

  const handleAdminDelete = () => {
    setAdminError("");
    if (adminActiveField === "passcode") {
      setAdminPasscode((prev) => prev.slice(0, -1));
    } else {
      setAdminRetryPasscode((prev) => prev.slice(0, -1));
    }
  };

  const handleCreateAdmin = () => {
    if (!adminName.trim()) {
      setAdminError("Name is required");
      return;
    }
    if (adminPasscode.length !== 6) {
      setAdminError("Passcode must be 6 digits");
      return;
    }
    if (adminPasscode !== adminRetryPasscode) {
      setAdminError("Passcodes do not match");
      return;
    }
    setAdminError("");
    createAdminMutation.mutate({ name: adminName.trim(), passcode: adminPasscode });
  };

  const handleClose = () => {
    setStep("password");
    setPassword("");
    setError("");
    setAdminName("");
    setAdminPasscode("");
    setAdminRetryPasscode("");
    setAdminError("");
    setActiveSubmenu(null);
    setShowSensors(false);
    setPendingAction(null);
    setActionPasscode("");
    setActionError("");
    onClose();
  };

  const handleAdminAccounts = () => {
    setActiveSubmenu("admin-accounts");
  };

  const handleActivityLogs = () => {
    setActiveSubmenu("logs");
  };

  const handleDatabase = () => {
    setActiveSubmenu("database");
  };

  const handleAIIntegration = () => {
    setActiveSubmenu("ai-integration");
  };

  const handleActionPrompt = (action: "export" | "import" | "delete") => {
    setPendingAction(action);
    setActionPasscode("");
    setActionError("");
  };

  const handleActionPasscodePress = (num: string) => {
    if (actionPasscode.length < 6) {
      setActionPasscode((prev) => prev + num);
      setActionError("");
    }
  };

  const handleActionPasscodeDelete = () => {
    setActionPasscode((prev) => prev.slice(0, -1));
    setActionError("");
  };

  const handleExport = async () => {
    const url = new URL("/api/settings/export", window.location.origin);
    if (account) {
      url.searchParams.set("accountId", account.id.toString());
      url.searchParams.set("accountName", account.name);
    }
    const a = document.createElement("a");
    a.href = url.toString();
    a.download = `risecare-backup-${Date.now()}.db`;
    a.click();
    setPendingAction(null);
    setActionPasscode("");
  };

  const handleImport = async () => {
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
        alert("Database imported successfully");
      } else {
        alert("Failed to import database");
      }
    };
    input.click();
    setPendingAction(null);
    setActionPasscode("");
  };

  const handleDeleteRecords = async () => {
    if (!confirm("Delete all patient records? This cannot be undone.")) return;

    const url = new URL("/api/settings/delete", window.location.origin);
    if (account) {
      url.searchParams.set("accountId", account.id.toString());
      url.searchParams.set("accountName", account.name);
    }
    try {
      const res = await fetch(url.toString(), { method: "POST" });
      if (res.ok) {
        alert("All records deleted");
      } else {
        alert("Failed to delete records");
      }
    } catch {
      alert("Failed to delete records");
    }
    setPendingAction(null);
    setActionPasscode("");
  };

  const handleActionVerify = async () => {
    if (actionPasscode.length !== 6) {
      setActionError("Passcode must be 6 digits");
      return;
    }
    try {
      const res = await fetch("/api/settings/verify-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: actionPasscode }),
      });
      const data = await res.json();
      if (!data.success) {
        setActionError("Incorrect passcode");
        setActionPasscode("");
        return;
      }
    } catch {
      setActionError("Failed to verify passcode");
      return;
    }

    if (pendingAction === "export") await handleExport();
    else if (pendingAction === "import") await handleImport();
    else if (pendingAction === "delete") await handleDeleteRecords();
  };

  return (
    <>
      <>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
            <div className="bg-card rounded-3xl shadow-2xl p-8 w-full max-w-md border border-border/50 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <button
                  onClick={() => {
                    if (pendingAction) {
                      setPendingAction(null);
                      setActionPasscode("");
                      setActionError("");
                    } else if (step === "create-admin") {
                      setStep("menu");
                      setActiveSubmenu("admin-accounts");
                      setAdminName(""); setAdminPasscode(""); setAdminRetryPasscode(""); setAdminError("");
                    } else if (activeSubmenu) setActiveSubmenu(null);
                    else handleClose();
                  }}
                  className="p-2 rounded-full hover:bg-muted"
                >
                  {activeSubmenu || step === "create-admin" || pendingAction ? (
                    <ChevronRight className="w-6 h-6 rotate-180" />
                  ) : (
                    <X className="w-6 h-6" />
                  )}
                </button>
                <h2 className="text-2xl font-bold">
                  {pendingAction === "delete"
                    ? "Verify to Delete"
                    : pendingAction
                      ? "Verify to Continue"
                      : step === "create-admin"
                        ? "Create Admin"
                        : activeSubmenu === "logs"
                          ? "Activity Logs"
                          : activeSubmenu === "database"
                            ? "Database"
                            : activeSubmenu === "admin-accounts"
                              ? "Admin Accounts"
                              : activeSubmenu === "ai-integration"
                                ? "AI Integration"
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
                        className="h-16 text-2xl font-semibold bg-secondary rounded-xl "
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      onClick={handlePasswordDelete}
                      className="h-16 flex items-center justify-center bg-muted rounded-xl "
                    >
                      <X className="w-6 h-6" />
                    </button>
                    <button
                      onClick={() => handleKeyPress("0")}
                      className="h-16 text-2xl font-semibold bg-secondary rounded-xl "
                    >
                      0
                    </button>
                    <button
                      onClick={handlePasswordSubmit}
                      disabled={password.length !== 6}
                      className="h-16 flex items-center justify-center bg-primary text-white rounded-xl disabled:opacity-50"
                    >
                      <Check className="w-6 h-6" />
                    </button>
                  </div>
                </>
              ) : step === "create-admin" ? (
                <>
                  <div className="space-y-4 mb-6">
                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-foreground">Admin Name</label>
                      <input
                        type="text"
                        value={adminName}
                        onChange={(e) => { setAdminName(e.target.value); setAdminError(""); }}
                        placeholder="Enter admin name"
                        className="w-full h-12 px-4 text-lg rounded-xl bg-background border-2 border-border outline-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-foreground">Passcode (6 digits)</label>
                      <div className="flex gap-2">
                        <div
                          onClick={() => setAdminActiveField("passcode")}
                          className={`flex-1 flex items-center justify-center h-14 rounded-xl border-2 ${
                            adminActiveField === "passcode" ? "border-primary bg-primary/5" : "border-border"
                          }`}
                        >
                          <span className="text-2xl font-bold tracking-widest">
                            {adminPasscode ? "•".repeat(adminPasscode.length) : <span className="text-muted-foreground/30">000000</span>}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-semibold text-foreground">Retry Passcode</label>
                      <div className="flex gap-2">
                        <div
                          onClick={() => setAdminActiveField("retry")}
                          className={`flex-1 flex items-center justify-center h-14 rounded-xl border-2 ${
                            adminActiveField === "retry" ? "border-primary bg-primary/5" : "border-border"
                          }`}
                        >
                          <span className="text-2xl font-bold tracking-widest">
                            {adminRetryPasscode ? "•".repeat(adminRetryPasscode.length) : <span className="text-muted-foreground/30">000000</span>}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {adminError && (
                    <p className="text-red-500 text-center mb-4 text-sm">{adminError}</p>
                  )}

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                      <button
                        key={num}
                        onClick={() => handleAdminKeyPress(num.toString())}
                        className="h-16 text-2xl font-semibold bg-secondary rounded-xl"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      onClick={handleAdminDelete}
                      className="h-16 flex items-center justify-center bg-muted rounded-xl"
                    >
                      <X className="w-6 h-6" />
                    </button>
                    <button
                      onClick={() => handleAdminKeyPress("0")}
                      className="h-16 text-2xl font-semibold bg-secondary rounded-xl"
                    >
                      0
                    </button>
                    <button
                      onClick={handleCreateAdmin}
                      disabled={createAdminMutation.isPending}
                      className="h-16 flex items-center justify-center bg-primary text-white rounded-xl disabled:opacity-50"
                    >
                      {createAdminMutation.isPending ? (
                        <Loader2 className="w-6 h-6" />
                      ) : (
                        <Check className="w-6 h-6" />
                      )}
                    </button>
                  </div>
                </>
              ) : activeSubmenu === "logs" ? (
                <div>
                  {logsLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-8 h-8" />
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
              ) : pendingAction ? (
                <>
                  <p className="text-center text-muted-foreground mb-4">
                    {pendingAction === "delete"
                      ? "Enter admin passcode to delete all records"
                      : `Enter admin passcode to ${pendingAction} the database`}
                  </p>
                  <div className="flex justify-center gap-2 mb-6">
                    {[0, 1, 2, 3, 4, 5].map((i) => (
                      <div
                        key={i}
                        className="w-12 h-14 border-2 border-border rounded-lg flex items-center justify-center text-2xl font-bold"
                      >
                        {actionPasscode[i] ? "•" : ""}
                      </div>
                    ))}
                  </div>

                  {actionError && (
                    <p className="text-red-500 text-center mb-4">{actionError}</p>
                  )}

                  <div className="grid grid-cols-3 gap-3 mb-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                      <button
                        key={num}
                        onClick={() => handleActionPasscodePress(num.toString())}
                        className="h-16 text-2xl font-semibold bg-secondary rounded-xl"
                      >
                        {num}
                      </button>
                    ))}
                    <button
                      onClick={handleActionPasscodeDelete}
                      className="h-16 flex items-center justify-center bg-muted rounded-xl"
                    >
                      <X className="w-6 h-6" />
                    </button>
                    <button
                      onClick={() => handleActionPasscodePress("0")}
                      className="h-16 text-2xl font-semibold bg-secondary rounded-xl"
                    >
                      0
                    </button>
                    <button
                      onClick={handleActionVerify}
                      disabled={actionPasscode.length !== 6}
                      className="h-16 flex items-center justify-center bg-red-600 text-white rounded-xl disabled:opacity-50"
                    >
                      <Check className="w-6 h-6" />
                    </button>
                  </div>
                </>
              ) : activeSubmenu === "database" ? (
                <div className="space-y-3">
                  <button
                    onClick={() => handleActionPrompt("export")}
                    className="w-full flex items-center gap-3 p-4 rounded-xl bg-secondary hover:bg-secondary/80  text-left"
                  >
                    <FileText className="w-5 h-5" />
                    <span className="text-lg font-semibold">Export Database</span>
                  </button>
                  <button
                    onClick={() => handleActionPrompt("import")}
                    className="w-full flex items-center gap-3 p-4 rounded-xl bg-secondary hover:bg-secondary/80  text-left"
                  >
                    <Database className="w-5 h-5" />
                    <span className="text-lg font-semibold">Import Database</span>
                  </button>
                  <button
                    onClick={() => handleActionPrompt("delete")}
                    className="w-full flex items-center gap-3 p-4 rounded-xl bg-red-100 hover:bg-red-200 text-red-700  text-left"
                  >
                    <FileText className="w-5 h-5" />
                    <span className="text-lg font-semibold">Delete Records</span>
                  </button>
                </div>
              ) : activeSubmenu === "admin-accounts" ? (
                <div className="space-y-3">
                  <button
                    onClick={() => { setStep("create-admin"); setAdminError(""); }}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary hover:bg-secondary/80 "
                  >
                    <div className="flex items-center gap-3">
                      <UserPlus className="w-5 h-5" />
                      <span className="text-lg font-semibold">Create Admin</span>
                    </div>
                    <ChevronRight className="w-5 h-5" />
                  </button>

                  {accountsLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-8 h-8" />
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      <div className="flex items-center gap-2 px-2 py-2">
                        <List className="w-5 h-5" />
                        <span className="text-lg font-semibold">Registered Admins</span>
                        <span className="text-sm text-muted-foreground ml-auto">({adminAccounts?.length ?? 0})</span>
                      </div>
                      {adminAccounts?.length > 0 ? (
                        adminAccounts.map((acc) => (
                          <div
                            key={acc.id}
                            className="p-3 rounded-lg bg-secondary text-sm"
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-semibold">{acc.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(acc.created_at).toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground py-6 text-sm">
                          No admin accounts
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ) : activeSubmenu === "ai-integration" ? (
                <div className="space-y-3">
                  {aiModeLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-8 h-8" />
                    </div>
                  ) : (
                    <>
                      <p className="text-sm text-muted-foreground mb-2">
                        Select how health recommendations are generated:
                      </p>
                      <button
                        onClick={() => setAiModeMutation.mutate("integrated")}
                        disabled={setAiModeMutation.isPending}
                        className={`w-full flex items-center gap-3 p-4 rounded-xl text-left ${
                          aiMode === "integrated"
                            ? "bg-primary/10 border-2 border-primary"
                            : "bg-secondary"
                        }`}
                      >
                        <Brain className="w-5 h-5" />
                        <div>
                          <span className="text-lg font-semibold block">Integrated AI</span>
                          <span className="text-sm text-muted-foreground">
                            Uses Ollama AI model for dynamic recommendations
                          </span>
                        </div>
                        {aiMode === "integrated" && <Check className="w-5 h-5 ml-auto text-primary" />}
                      </button>
                      <button
                        onClick={() => setAiModeMutation.mutate("rule-based")}
                        disabled={setAiModeMutation.isPending}
                        className={`w-full flex items-center gap-3 p-4 rounded-xl text-left ${
                          aiMode === "rule-based"
                            ? "bg-primary/10 border-2 border-primary"
                            : "bg-secondary"
                        }`}
                      >
                        <Cpu className="w-5 h-5" />
                        <div>
                          <span className="text-lg font-semibold block">Rule-Based AI</span>
                          <span className="text-sm text-muted-foreground">
                            Uses predefined rules based on vital thresholds
                          </span>
                        </div>
                        {aiMode === "rule-based" && <Check className="w-5 h-5 ml-auto text-primary" />}
                      </button>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => setShowSensors(true)}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary hover:bg-secondary/80 "
                  >
                    <div className="flex items-center gap-3">
                      <Activity className="w-5 h-5" />
                      <span className="text-lg font-semibold">Sensors</span>
                    </div>
                    <ChevronRight className="w-5 h-5" />
                  </button>

                  <button
                    onClick={handleActivityLogs}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary hover:bg-secondary/80 "
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5" />
                      <span className="text-lg font-semibold">Activity Log</span>
                    </div>
                    <ChevronRight className="w-5 h-5" />
                  </button>

                  <button
                    onClick={handleDatabase}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary hover:bg-secondary/80 "
                  >
                    <div className="flex items-center gap-3">
                      <Database className="w-5 h-5" />
                      <span className="text-lg font-semibold">Database</span>
                    </div>
                    <ChevronRight className="w-5 h-5" />
                  </button>

                  <button
                    onClick={() => printTestMutation.mutate()}
                    disabled={printTestMutation.isPending}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary hover:bg-secondary/80 "
                  >
                    <div className="flex items-center gap-3">
                      <Printer className="w-5 h-5" />
                      <span className="text-lg font-semibold">Print Test</span>
                    </div>
                    {printTestMutation.isPending ? (
                      <Loader2 className="w-5 h-5" />
                    ) : (
                      <ChevronRight className="w-5 h-5" />
                    )}
                  </button>

                  <button
                    onClick={handleAIIntegration}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary hover:bg-secondary/80 "
                  >
                    <div className="flex items-center gap-3">
                      <Brain className="w-5 h-5" />
                      <span className="text-lg font-semibold">AI Integration</span>
                    </div>
                    <ChevronRight className="w-5 h-5" />
                  </button>

                  <button
                    onClick={handleAdminAccounts}
                    className="w-full flex items-center justify-between p-4 rounded-xl bg-secondary hover:bg-secondary/80 "
                  >
                    <div className="flex items-center gap-3">
                      <Shield className="w-5 h-5" />
                      <span className="text-lg font-semibold">Admin Accounts</span>
                    </div>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </>

      <SensorsDialog
        isOpen={showSensors}
        onClose={() => setShowSensors(false)}
      />
    </>
  );
}
