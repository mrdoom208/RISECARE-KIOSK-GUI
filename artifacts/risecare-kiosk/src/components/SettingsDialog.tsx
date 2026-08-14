import { useState } from "react";
import {
  X,
  Check,
  Database,
  FileText,
  ChevronRight,
  Loader2,
  Activity,
  Shield,
  UserPlus,
  List,
  Brain,
  Cpu,
  Lightbulb,
  Power,
  Timer,
  RotateCw,
  Lock,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
} from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useRateLimit } from "@/hooks/use-rate-limit";
import { SensorsDialog } from "./SensorsDialog";

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SettingsDialog({ isOpen, onClose }: SettingsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isRateLimited } = useRateLimit(800);
  const [step, setStep] = useState<"password" | "menu" | "create-admin" | "edit-account">("password");
  const [loginUsername, setLoginUsername] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [error, setError] = useState("");
  const [activeSubmenu, setActiveSubmenu] = useState<
    "logs" | "database" | "accounts" | "ai-integration" | "idle-timeout" | null
  >(null);
  const [showSensors, setShowSensors] = useState(false);

  const [creatingRole, setCreatingRole] = useState<"superadmin" | "admin">("admin");
  const [editingAccount, setEditingAccount] = useState<{ id: number; username: string; role: string } | null>(null);
  const [confirmRemoveId, setConfirmRemoveId] = useState<number | null>(null);

  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminRetryPassword, setAdminRetryPassword] = useState("");
  const [adminActiveField, setAdminActiveField] = useState<"passcode" | "retry">("passcode");
  const [adminError, setAdminError] = useState("");
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showAdminRetryPassword, setShowAdminRetryPassword] = useState(false);
  const [showActionPassword, setShowActionPassword] = useState(false);

  const [pendingAction, setPendingAction] = useState<"export" | "import" | "delete" | null>(null);
  const [actionPassword, setActionPassword] = useState("");
  const [actionError, setActionError] = useState("");
  const [verifyingPassword, setVerifyingPassword] = useState(false);
  const [verifyingAction, setVerifyingAction] = useState(false);
  const [timeoutCooldown, setTimeoutCooldown] = useState(false);

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
      let url = "/api/settings/logs";
      if (account) url += `?accountId=${account.id}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: activeSubmenu === "logs",
  });

  const { data: adminAccounts, isLoading: accountsLoading } = useQuery({
    queryKey: ["accounts"],
    queryFn: async () => {
      let url = "/api/settings/accounts";
      if (account) url += `?accountId=${account.id}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch accounts");
      return res.json() as Promise<{ id: number; username: string; role: string; created_at: string }[]>;
    },
    enabled: activeSubmenu === "accounts",
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

  const { data: recEnabled, isLoading: recLoading } = useQuery({
    queryKey: ["recommendation-enabled"],
    queryFn: async () => {
      const res = await fetch("/api/settings/recommendation");
      if (!res.ok) throw new Error("Failed to fetch recommendation setting");
      const data = await res.json();
      return data.enabled as boolean;
    },
  });

  const setRecMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      let url = "/api/settings/recommendation";
      if (account) {
        url += `?accountId=${account.id}&accountName=${encodeURIComponent(account.username)}`;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to set recommendation");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recommendation-enabled"] });
      toast({ title: "Recommendation setting updated" });
    },
    onError: () => {
      toast({ title: "Failed to update recommendation setting", variant: "destructive" });
    },
  });

  const setAiModeMutation = useMutation({
    mutationFn: async (mode: string) => {
      let url = "/api/settings/ai-mode";
      if (account) {
        url += `?accountId=${account.id}&accountName=${encodeURIComponent(account.username)}`;
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

  const { data: idleTimeoutSeconds, isLoading: timeoutLoading } = useQuery({
    queryKey: ["idle-timeout"],
    queryFn: async () => {
      const res = await fetch("/api/settings/idle-timeout");
      if (!res.ok) throw new Error("Failed to fetch idle timeout");
      const data = await res.json();
      return (data.seconds ?? 120) as number;
    },
    enabled: activeSubmenu === "idle-timeout",
  });

  const setIdleTimeoutMutation = useMutation({
    mutationFn: async (seconds: number) => {
      let url = "/api/settings/idle-timeout";
      if (account) {
        url += `?accountId=${account.id}&accountName=${encodeURIComponent(account.username)}`;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds }),
      });
      if (!res.ok) throw new Error("Failed to set idle timeout");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["idle-timeout"] });
      toast({ title: "Idle timeout updated" });
    },
    onError: () => {
      toast({ title: "Failed to update idle timeout", variant: "destructive" });
    },
  });

  const [account, setAccount] = useState<{ id: number; username: string; role: string } | null>(null);
  const isSuperadmin = account?.role === "superadmin";

  const [showPowerModal, setShowPowerModal] = useState(false);
  const [powerAction, setPowerAction] = useState<
    "shutdown" | "restart" | "lock" | null
  >(null);
  const powerMutation = useMutation({
    mutationFn: async (action: "shutdown" | "restart" | "lock") => {
      let url = "/api/settings/power";
      if (account) {
        url += `?accountId=${account.id}&accountName=${encodeURIComponent(account.username)}`;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error("Power command failed");
      return res.json();
    },
    onSuccess: (_data, action) => {
      const label = action.charAt(0).toUpperCase() + action.slice(1);
      toast({ title: label, description: `${label} command sent to system` });
      setShowPowerModal(false);
      setPowerAction(null);
    },
    onError: () => {
      toast({ title: "Power command failed", description: "Could not send command", variant: "destructive" });
    },
  });

  const createAdminMutation = useMutation({
    mutationFn: async (data: { username: string; password: string; role: "superadmin" | "admin" }) => {
      let url = "/api/settings/register";
      if (account) {
        url += `?accountId=${account.id}&accountName=${encodeURIComponent(account.username)}`;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: data.username, password: data.password, role: data.role }),
      });
      if (!res.ok) {
        let msg = data.role === "admin" ? "Failed to create admin" : "Failed to create super admin";
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
    onSuccess: (_data, vars) => {
      toast({ title: vars.role === "superadmin" ? "Super admin created" : "Admin created", description: "New account has been created" });
      setAdminUsername("");
      setAdminPassword("");
      setAdminRetryPassword("");
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setStep("menu");
    },
    onError: (err: Error) => {
      setAdminError(err.message);
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: async (data: { id: number; username: string; password: string; role: string }) => {
      let url = `/api/settings/accounts/${data.id}`;
      if (account) {
        url += `?accountId=${account.id}&accountName=${encodeURIComponent(account.username)}`;
      }
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: data.username, password: data.password, role: data.role }),
      });
      if (!res.ok) {
        let msg = "Failed to update account";
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
      toast({ title: "Account updated", description: "Changes saved" });
      setAdminUsername("");
      setAdminPassword("");
      setAdminRetryPassword("");
      setEditingAccount(null);
      setAdminError("");
      setAdminActiveField("passcode");
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setStep("menu");
    },
    onError: (err: Error) => {
      setAdminError(err.message);
    },
  });

  const removeAccountMutation = useMutation({
    mutationFn: async (id: number) => {
      let url = `/api/settings/accounts/${id}`;
      if (account) {
        url += `?accountId=${account.id}&accountName=${encodeURIComponent(account.username)}`;
      }
      const res = await fetch(url, { method: "DELETE" });
      if (!res.ok) {
        let msg = "Failed to remove account";
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
      toast({ title: "Account removed", description: "Account deleted" });
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
    },
    onError: (err: Error) => {
      toast({ title: "Failed to remove account", description: err.message, variant: "destructive" });
    },
  });

  const handleLoginSubmit = async () => {
    if (!loginUsername.trim() || !loginPassword || verifyingPassword) return;
    try {
      setVerifyingPassword(true);
      const res = await fetch("/api/settings/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: loginUsername.trim(), password: loginPassword }),
      });

      const data = await res.json();

      if (data.success) {
        setAccount(data.account);
        setStep("menu");
        setLoginPassword("");
        setError("");
      } else {
        setError(data.error || "Invalid username or password");
        setLoginPassword("");
      }
    } catch (e) {
      setError("Failed to login");
    } finally {
      setVerifyingPassword(false);
    }
  };

  const handleAdminValueChange = (value: string) => {
    setAdminError("");
    if (adminActiveField === "passcode") setAdminPassword(value);
    else setAdminRetryPassword(value);
  };

  const handleCreateAdmin = () => {
    if (!adminUsername.trim()) {
      setAdminError("Username is required");
      return;
    }
    if (adminPassword.length < 4) {
      setAdminError("Password must be at least 4 characters");
      return;
    }
    if (adminPassword !== adminRetryPassword) {
      setAdminError("Passwords do not match");
      return;
    }
    setAdminError("");
    createAdminMutation.mutate({ username: adminUsername.trim(), password: adminPassword, role: creatingRole });
  };

  const handleAdminPasscodeSubmit = (value: string) => {
    if (adminActiveField === "passcode") {
      if (!adminUsername.trim()) {
        setAdminError("Username is required");
        return;
      }
      if (adminPassword.length < 4) {
        setAdminError("Password must be at least 4 characters");
        return;
      }
      setAdminError("");
      setAdminActiveField("retry");
    } else {
      handleCreateAdmin();
    }
  };

  const handleEditAccount = () => {
    if (!editingAccount) return;
    if (!adminUsername.trim()) {
      setAdminError("Username is required");
      return;
    }
    if (adminPassword && adminPassword !== adminRetryPassword) {
      setAdminError("Passwords do not match");
      return;
    }
    if (adminPassword && adminPassword.length < 4) {
      setAdminError("Password must be at least 4 characters");
      return;
    }
    if (!adminPassword && adminRetryPassword) {
      setAdminError("Passwords do not match");
      return;
    }
    setAdminError("");
    updateAccountMutation.mutate({
      id: editingAccount.id,
      username: adminUsername.trim(),
      password: adminPassword,
      role: creatingRole,
    });
  };

  const openEditAccount = (acc: { id: number; username: string; role: string }) => {
    setEditingAccount(acc);
    setCreatingRole(acc.role === "superadmin" ? "superadmin" : "admin");
    setAdminUsername(acc.username);
    setAdminPassword("");
    setAdminRetryPassword("");
    setAdminActiveField("passcode");
    setAdminError("");
    setStep("edit-account");
  };

  const handleRemoveAccount = (id: number) => {
    if (isRateLimited("remove-account-" + id)) return;
    if (confirmRemoveId !== id) {
      setConfirmRemoveId(id);
      return;
    }
    setConfirmRemoveId(null);
    removeAccountMutation.mutate(id);
  };

  const handleClose = () => {
    setStep("password");
    setLoginUsername("");
    setLoginPassword("");
    setError("");
    setAdminUsername("");
    setAdminPassword("");
    setAdminRetryPassword("");
    setAdminError("");
    setAdminActiveField("passcode");
    setCreatingRole("admin");
    setEditingAccount(null);
    setConfirmRemoveId(null);
    setActiveSubmenu(null);
    setShowSensors(false);
    setShowPowerModal(false);
    setPowerAction(null);
    setPendingAction(null);
    setActionPassword("");
    setActionError("");
    onClose();
  };

  const handleAccounts = () => {
    setActiveSubmenu("accounts");
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

  const handleIdleTimeout = () => {
    setActiveSubmenu("idle-timeout");
  };

  const handleIdleTimeoutSelect = (seconds: number) => {
    if (isRateLimited("idle-timeout")) {
      setTimeoutCooldown(true);
      setTimeout(() => setTimeoutCooldown(false), 1000);
      return;
    }
    setTimeoutCooldown(false);
    setIdleTimeoutMutation.mutate(seconds);
  };

  const handleActionPrompt = (action: "export" | "import" | "delete") => {
    setPendingAction(action);
    setActionPassword("");
    setActionError("");
  };

  const handleActionValueChange = (value: string) => {
    setActionError("");
    setActionPassword(value);
  };

  const handleExport = async () => {
    const url = new URL("/api/settings/export", window.location.origin);
    if (account) {
      url.searchParams.set("accountId", account.id.toString());
      url.searchParams.set("accountName", account.username);
    }
    const a = document.createElement("a");
    a.href = url.toString();
    a.download = `risecare-backup-${Date.now()}.db`;
    a.click();
    setPendingAction(null);
    setActionPassword("");
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
        formData.append("accountName", account.username);
      }

      try {
        const res = await fetch("/api/settings/import", {
          method: "POST",
          body: formData,
        });

        if (res.ok) {
          toast({ title: "Database imported", description: "Database imported successfully" });
        } else {
          toast({ title: "Import failed", description: "Failed to import database", variant: "destructive" });
        }
      } catch {
        toast({ title: "Import failed", description: "Failed to import database", variant: "destructive" });
      }
    };
    input.click();
    setPendingAction(null);
    setActionPassword("");
  };

  const handleDeleteRecords = async () => {
    const url = new URL("/api/settings/delete", window.location.origin);
    if (account) {
      url.searchParams.set("accountId", account.id.toString());
      url.searchParams.set("accountName", account.username);
    }
    try {
      const res = await fetch(url.toString(), { method: "POST" });
      if (res.ok) {
        toast({ title: "Records deleted", description: "All records deleted successfully" });
      } else {
        toast({ title: "Delete failed", description: "Failed to delete records", variant: "destructive" });
      }
    } catch {
      toast({ title: "Delete failed", description: "Failed to delete records", variant: "destructive" });
    }
    setPendingAction(null);
    setActionPassword("");
  };

  const handleActionVerify = async (password: string) => {
    if (!password || password.length < 4) {
      setActionError("Enter your password");
      return;
    }
    try {
      setVerifyingAction(true);
      const res = await fetch("/api/settings/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: account?.username, password }),
      });
      const data = await res.json();
      if (!data.success) {
        setActionError("Incorrect password");
        setActionPassword("");
        return;
      }
    } catch {
      setActionError("Failed to verify password");
      return;
    } finally {
      setVerifyingAction(false);
    }

    if (pendingAction === "export") await handleExport();
    else if (pendingAction === "import") await handleImport();
    else if (pendingAction === "delete") await handleDeleteRecords();
  };

  return (
    <>
      <>
        {isOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
            style={{ paddingBottom: "calc(1rem + var(--vk-height, 0px))" }}
          >
            <div className="bg-card rounded-3xl shadow-2xl p-6 sm:p-8 md:p-10 w-full max-w-2xl border border-border/50 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <button
                  onClick={() => {
                    if (pendingAction) {
                      setPendingAction(null);
                      setActionPassword("");
                      setActionError("");
                    } else if (step === "create-admin" || step === "edit-account") {
                      setStep("menu");
                      setActiveSubmenu("accounts");
                      setEditingAccount(null);
                      setAdminUsername(""); setAdminPassword(""); setAdminRetryPassword(""); setAdminError("");
                    } else if (activeSubmenu) setActiveSubmenu(null);
                    else handleClose();
                  }}
                  className="p-2 rounded-full hover:bg-muted"
                >
                  {activeSubmenu || step === "create-admin" || step === "edit-account" || pendingAction ? (
                    <ChevronRight className="w-6 h-6 rotate-180" />
                  ) : (
                    <X className="w-6 h-6" />
                  )}
                </button>
                <h2 className="text-3xl font-bold">
                  {pendingAction === "delete"
                    ? "Verify to Delete"
                    : pendingAction
                      ? "Verify to Continue"
                      : step === "create-admin"
                        ? creatingRole === "superadmin"
                          ? "Create Super Admin"
                          : "Create Admin"
                        : step === "edit-account"
                          ? "Edit Account"
                          : activeSubmenu === "logs"
                          ? "Activity Logs"
                          : activeSubmenu === "database"
                            ? "Database"
                            : activeSubmenu === "accounts"
                              ? "Accounts"
                            : activeSubmenu === "ai-integration"
                              ? "AI Integration"
                              : activeSubmenu === "idle-timeout"
                                ? "Idle Timeout"
                                : step === "password"
                                  ? "Login"
                                  : "Settings"}
                </h2>
                <div className="w-10" />
              </div>

              {step === "password" ? (
                <>
                  {error && (
                    <p className="text-red-500 text-center text-sm mb-3">{error}</p>
                  )}
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-foreground">Username</label>
                      <input
                        type="text"
                        value={loginUsername}
                        onChange={(e) => { setError(""); setLoginUsername(e.target.value); }}
                        onKeyDown={(e) => { if (e.key === "Enter") handleLoginSubmit(); }}
                        placeholder="Enter username"
                        className="w-full h-14 px-5 text-xl rounded-xl bg-background border-2 border-border outline-none"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-sm font-semibold text-foreground">Password</label>
                      <div className="relative">
                        <input
                          type={showLoginPassword ? "text" : "password"}
                          value={loginPassword}
                          onChange={(e) => { setError(""); setLoginPassword(e.target.value); }}
                          onKeyDown={(e) => { if (e.key === "Enter") handleLoginSubmit(); }}
                          placeholder="Enter password"
                          className="w-full h-14 px-5 pr-16 text-xl rounded-xl bg-background border-2 border-border outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowLoginPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted-foreground hover:text-foreground"
                          aria-label={showLoginPassword ? "Hide password" : "Show password"}
                        >
                          {showLoginPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                        </button>
                      </div>
                    </div>

                    <button
                      onClick={handleLoginSubmit}
                      disabled={!loginUsername.trim() || !loginPassword || verifyingPassword}
                      className="w-full h-16 rounded-2xl bg-primary text-primary-foreground text-2xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {verifyingPassword ? (
                        <Loader2 className="w-7 h-7 animate-spin" />
                      ) : (
                        "Enter"
                      )}
                    </button>
                  </div>
                </>
              ) : step === "create-admin" || step === "edit-account" ? (
                <>
                  <div className="space-y-5 mb-6">
                    <div className="space-y-2">
                      <label className="text-lg font-semibold text-foreground">Role</label>
                      <select
                        value={creatingRole}
                        onChange={(e) => { setCreatingRole(e.target.value as "superadmin" | "admin"); setAdminError(""); }}
                        className="w-full h-16 px-5 text-2xl rounded-xl bg-background border-2 border-border outline-none"
                      >
                        <option value="superadmin">Super Admin</option>
                        <option value="admin">Admin</option>
                      </select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-lg font-semibold text-foreground">Username</label>
                      <input
                        type="text"
                        value={adminUsername}
                        onChange={(e) => { setAdminUsername(e.target.value); setAdminError(""); }}
                        placeholder="Enter username"
                        className="w-full h-16 px-5 text-2xl rounded-xl bg-background border-2 border-border outline-none"
                      />
                    </div>

                    {step === "edit-account" ? (
                      <>
                        <div className="space-y-2">
                          <label className="text-lg font-semibold text-foreground">New Password</label>
                          <div className="relative">
                            <input
                              type={showAdminPassword ? "text" : "password"}
                              value={adminPassword}
                              onChange={(e) => { setAdminError(""); setAdminPassword(e.target.value); }}
                              placeholder="Leave blank to keep current password"
                              className="w-full h-16 px-5 pr-16 text-2xl rounded-xl bg-background border-2 border-primary/50 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setShowAdminPassword((v) => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted-foreground hover:text-foreground"
                              aria-label={showAdminPassword ? "Hide password" : "Show password"}
                            >
                              {showAdminPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                            </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-lg font-semibold text-foreground">Re-enter New Password</label>
                          <div className="relative">
                            <input
                              type={showAdminRetryPassword ? "text" : "password"}
                              value={adminRetryPassword}
                              onChange={(e) => { setAdminError(""); setAdminRetryPassword(e.target.value); }}
                              placeholder="Re-enter new password"
                              className="w-full h-16 px-5 pr-16 text-2xl rounded-xl bg-background border-2 border-primary/50 outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => setShowAdminRetryPassword((v) => !v)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted-foreground hover:text-foreground"
                              aria-label={showAdminRetryPassword ? "Hide password" : "Show password"}
                            >
                              {showAdminRetryPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="space-y-2">
                        <label className="text-lg font-semibold text-foreground">
                          {adminActiveField === "retry" ? "Retry Password" : "Password"}
                        </label>
                        <div className="relative">
                          <input
                            type={showAdminPassword ? "text" : "password"}
                            value={adminActiveField === "passcode" ? adminPassword : adminRetryPassword}
                            onChange={(e) => handleAdminValueChange(e.target.value)}
                            placeholder={adminActiveField === "retry" ? "Re-enter password" : "Enter password"}
                            className="w-full h-16 px-5 pr-16 text-2xl rounded-xl bg-background border-2 border-primary/50 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowAdminPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted-foreground hover:text-foreground"
                            aria-label={showAdminPassword ? "Hide password" : "Show password"}
                          >
                            {showAdminPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {adminError && (
                    <p className="text-red-500 text-center mb-4 text-base">{adminError}</p>
                  )}

                  <button
                    onClick={() => {
                      if (step === "edit-account") {
                        handleEditAccount();
                      } else {
                        handleAdminPasscodeSubmit(adminActiveField === "passcode" ? adminPassword : adminRetryPassword);
                      }
                    }}
                    disabled={
                      createAdminMutation.isPending ||
                      updateAccountMutation.isPending ||
                      !adminUsername.trim() ||
                      (step === "edit-account"
                        ? (adminPassword.length > 0 && adminPassword.length < 4) ||
                          (adminRetryPassword.length > 0 && adminRetryPassword.length < 4)
                        : adminActiveField === "passcode"
                          ? adminPassword.length < 4
                          : adminRetryPassword.length < 4)
                    }
                    className="w-full h-16 rounded-2xl bg-primary text-primary-foreground text-2xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {step === "edit-account" ? (
                      updateAccountMutation.isPending ? (
                        <Loader2 className="w-7 h-7 animate-spin" />
                      ) : (
                        "Save Changes"
                      )
                    ) : createAdminMutation.isPending ? (
                      <Loader2 className="w-7 h-7 animate-spin" />
                    ) : adminActiveField === "retry" ? (
                      "Create Account"
                    ) : (
                      "Continue"
                    )}
                  </button>
                </>
              ) : activeSubmenu === "logs" ? (
                <div>
                  {logsLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-8 h-8" />
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[55vh] overflow-y-auto">
                      {activityLogs?.length > 0 ? (
                        activityLogs.map((log: any, i: number) => (
                          <div
                            key={i}
                            className="p-4 rounded-lg bg-secondary text-base"
                          >
                            <div className="flex justify-between items-start gap-3">
                              <p className="font-semibold">
                                {log.action || "Unknown action"}
                              </p>
                              <span className="text-sm bg-primary/10 text-primary px-3 py-1 rounded-full shrink-0">
                                {log.account_name || "Unknown"}
                              </span>
                            </div>
                            {log.details && (
                              <p className="text-muted-foreground text-sm mt-1.5">
                                {log.details}
                              </p>
                            )}
                            <p className="text-muted-foreground text-sm mt-1.5">
                              {log.created_at
                                ? new Date(log.created_at).toLocaleString()
                                : "Unknown time"}
                            </p>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground py-10">
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
                      ? "Enter your password to delete all records"
                      : `Enter your password to ${pendingAction} the database`}
                  </p>
                  <div className="space-y-3">
                    <div className="relative">
                      <input
                        type={showActionPassword ? "text" : "password"}
                        value={actionPassword}
                        onChange={(e) => handleActionValueChange(e.target.value)}
                        placeholder="Enter password"
                        className="w-full h-14 px-5 pr-16 text-xl rounded-xl bg-background border-2 border-border outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowActionPassword((v) => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted-foreground hover:text-foreground"
                        aria-label={showActionPassword ? "Hide password" : "Show password"}
                      >
                        {showActionPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                      </button>
                    </div>
                    {actionError && (
                      <p className="text-red-500 text-center text-sm">{actionError}</p>
                    )}
                    <button
                      onClick={() => handleActionVerify(actionPassword)}
                      disabled={!actionPassword || verifyingAction}
                      className="w-full h-14 rounded-xl bg-red-600 text-white text-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {verifyingAction ? (
                        <Loader2 className="w-7 h-7 animate-spin" />
                      ) : (
                        "Verify"
                      )}
                    </button>
                  </div>
                </>
              ) : activeSubmenu === "database" ? (
                <div className="space-y-3">
                  <button
                    onClick={() => { if (isRateLimited("export")) return; handleActionPrompt("export"); }}
                    className="w-full flex items-center gap-3 p-4 rounded-xl bg-secondary hover:bg-secondary/80  text-left"
                  >
                    <FileText className="w-6 h-6" />
                    <span className="text-xl font-semibold">Export Database</span>
                  </button>
                  <button
                    onClick={() => { if (isRateLimited("import")) return; handleActionPrompt("import"); }}
                    className="w-full flex items-center gap-3 p-4 rounded-xl bg-secondary hover:bg-secondary/80  text-left"
                  >
                    <Database className="w-6 h-6" />
                    <span className="text-xl font-semibold">Import Database</span>
                  </button>
                  <button
                    onClick={() => { if (isRateLimited("delete-records")) return; handleActionPrompt("delete"); }}
                    className="w-full flex items-center gap-3 p-4 rounded-xl bg-red-100 hover:bg-red-200 text-red-700  text-left"
                  >
                    <FileText className="w-6 h-6" />
                    <span className="text-xl font-semibold">Delete Records</span>
                  </button>
                </div>
              ) : activeSubmenu === "accounts" ? (
                <div className="space-y-3">
                  <button
                    onClick={() => { if (isRateLimited("create-admin")) return; setCreatingRole("admin"); setAdminActiveField("passcode"); setStep("create-admin"); setAdminError(""); }}
                    className="w-full flex items-center justify-between p-5 rounded-xl bg-secondary hover:bg-secondary/80 "
                  >
                    <div className="flex items-center gap-3">
                      <UserPlus className="w-6 h-6" />
                      <span className="text-xl font-semibold">Create Account</span>
                    </div>
                    <ChevronRight className="w-6 h-6" />
                  </button>

                  {accountsLoading ? (
                    <div className="flex justify-center py-8">
                      <Loader2 className="w-8 h-8" />
                    </div>
                  ) : (
                    <div className="space-y-3 max-h-[50vh] overflow-y-auto">
                      <div className="flex items-center gap-2 px-2 py-2">
                        <List className="w-7 h-7" />
                        <span className="text-2xl font-semibold">Registered Accounts</span>
                        <span className="text-base text-muted-foreground ml-auto">({adminAccounts?.length ?? 0})</span>
                      </div>
                      {adminAccounts && adminAccounts.length > 0 ? (
                        adminAccounts.map((acc) => (
                          <div
                            key={acc.id}
                            className="p-4 rounded-lg bg-secondary"
                          >
                            <div className="flex justify-between items-center gap-3">
                              <div className="flex items-center gap-3 min-w-0">
                                <span className="text-xl font-semibold truncate">{acc.username}</span>
                                {account?.id === acc.id && (
                                  <span className="text-sm text-muted-foreground shrink-0">(you)</span>
                                )}
                                <span className={`text-sm px-3 py-1 rounded-full shrink-0 ${acc.role === "superadmin" ? "bg-primary/10 text-primary" : "bg-yellow-500/10 text-yellow-700"}`}>
                                  {acc.role === "superadmin" ? "Super Admin" : "Admin"}
                                </span>
                              </div>
                              <span className="text-base text-muted-foreground shrink-0">
                                {new Date(acc.created_at).toLocaleDateString()}
                              </span>
                            </div>
                            <div className="flex items-center gap-3 mt-3">
                              <button
                                onClick={() => { if (isRateLimited("edit-account-" + acc.id)) return; openEditAccount(acc); }}
                                className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary/10 text-primary text-lg font-semibold"
                              >
                                <Pencil className="w-5 h-5" />
                                Edit
                              </button>
                              {account?.id === acc.id ? null : confirmRemoveId === acc.id ? (
                                <>
                                  <button
                                    onClick={() => handleRemoveAccount(acc.id)}
                                    disabled={removeAccountMutation.isPending}
                                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-600 text-white text-lg font-semibold"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    onClick={() => setConfirmRemoveId(null)}
                                    className="flex items-center px-5 py-2.5 rounded-xl bg-muted text-lg font-semibold"
                                  >
                                    Cancel
                                  </button>
                                </>
                              ) : (
                                <button
                                  onClick={() => handleRemoveAccount(acc.id)}
                                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-red-100 text-red-700 text-lg font-semibold"
                                >
                                  <Trash2 className="w-5 h-5" />
                                  Remove
                                </button>
                              )}
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-center text-muted-foreground py-6 text-lg">
                          No accounts
                        </p>
                      )}
                    </div>
                  )}
                </div>
               ) : activeSubmenu === "ai-integration" ? (
                <div className="space-y-3">
                  {/* Recommendation master toggle */}
                  <div className="p-4 rounded-xl bg-secondary">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Lightbulb className="w-6 h-6" />
                        <div>
                          <span className="text-lg font-semibold block">Enable Recommendations</span>
                          <span className="text-sm text-muted-foreground">
                            {recLoading ? "Loading..." : recEnabled ? "Recommendations are shown after each session" : "No recommendations will be shown"}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          if (isRateLimited("rec-toggle")) return;
                          setRecMutation.mutate(!recEnabled);
                        }}
                        disabled={recLoading || setRecMutation.isPending}
                        className={`relative w-14 h-8 rounded-full transition-colors ${
                          recEnabled ? "bg-primary" : "bg-muted-foreground/30"
                        }`}
                      >
                        <div
                          className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                            recEnabled ? "left-7" : "left-1"
                          }`}
                        />
                      </button>
                    </div>
                  </div>

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
                        onClick={() => {
                          if (isRateLimited("ai-integrated")) return;
                          setAiModeMutation.mutate("integrated");
                        }}
                        disabled={setAiModeMutation.isPending}
                        className={`w-full flex items-center gap-3 p-4 rounded-xl text-left ${
                          aiMode === "integrated"
                            ? "bg-primary/10 border-2 border-primary"
                            : "bg-secondary"
                        }`}
                      >
                        <Brain className="w-6 h-6" />
                        <div>
                          <span className="text-lg font-semibold block">Integrated AI</span>
                          <span className="text-sm text-muted-foreground">
                            Uses Ollama AI model for dynamic recommendations
                          </span>
                        </div>
                        {aiMode === "integrated" && <Check className="w-5 h-5 ml-auto text-primary" />}
                      </button>
                      <button
                        onClick={() => {
                          if (isRateLimited("ai-rulebased")) return;
                          setAiModeMutation.mutate("rule-based");
                        }}
                        disabled={setAiModeMutation.isPending}
                        className={`w-full flex items-center gap-3 p-4 rounded-xl text-left ${
                          aiMode === "rule-based"
                            ? "bg-primary/10 border-2 border-primary"
                            : "bg-secondary"
                        }`}
                      >
                        <Cpu className="w-6 h-6" />
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
               ) : activeSubmenu === "idle-timeout" ? (
                <div className="space-y-3">
                  <div className="p-4 rounded-xl bg-secondary">
                    <div className="flex items-center gap-3">
                      <Timer className="w-6 h-6" />
                      <div>
                        <span className="text-lg font-semibold block">Idle Timeout</span>
                        {timeoutLoading ? (
                          <span className="text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
                          </span>
                        ) : setIdleTimeoutMutation.isPending ? (
                          <span className="text-sm text-muted-foreground flex items-center gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                          </span>
                        ) : timeoutCooldown ? (
                          <span className="text-sm text-muted-foreground">
                            Please wait a moment before changing again...
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            Returns to home after {idleTimeoutSeconds} seconds of inactivity
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground mb-1">
                    Select how long to wait with no interaction before returning to the home screen:
                  </p>

                  {[30, 60, 120, 300, 600].map((opt) => (
                    <button
                      key={opt}
                      onClick={() => handleIdleTimeoutSelect(opt)}
                      disabled={setIdleTimeoutMutation.isPending || timeoutCooldown}
                      className={`w-full flex items-center gap-3 p-4 rounded-xl text-left ${
                        idleTimeoutSeconds === opt
                          ? "bg-primary/10 border-2 border-primary"
                          : "bg-secondary"
                      } disabled:opacity-50`}
                    >
                      <Timer className="w-6 h-6" />
                      <div>
                        <span className="text-lg font-semibold block">
                          {opt < 60 ? `${opt} seconds` : `${opt / 60} minute${opt === 60 ? "" : "s"}`}
                        </span>
                      </div>
                      {setIdleTimeoutMutation.isPending && idleTimeoutSeconds === opt ? (
                        <Loader2 className="w-5 h-5 ml-auto animate-spin text-primary" />
                      ) : (
                        idleTimeoutSeconds === opt && <Check className="w-5 h-5 ml-auto text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={() => { if (isRateLimited("sensors")) return; setShowSensors(true); }}
                    className="w-full flex items-center justify-between p-5 rounded-xl bg-secondary hover:bg-secondary/80 "
                  >
                    <div className="flex items-center gap-3">
                      <Activity className="w-6 h-6" />
                      <span className="text-xl font-semibold">Sensors/Print Test</span>
                    </div>
                    <ChevronRight className="w-6 h-6" />
                  </button>

                  {isSuperadmin && (
                    <button
                      onClick={() => { if (isRateLimited("activity-log")) return; handleActivityLogs(); }}
                      className="w-full flex items-center justify-between p-5 rounded-xl bg-secondary hover:bg-secondary/80 "
                    >
                      <div className="flex items-center gap-3">
                        <FileText className="w-6 h-6" />
                        <span className="text-xl font-semibold">Activity Log</span>
                      </div>
                      <ChevronRight className="w-6 h-6" />
                    </button>
                  )}

                  <button
                    onClick={() => { if (isRateLimited("database")) return; handleDatabase(); }}
                    className="w-full flex items-center justify-between p-5 rounded-xl bg-secondary hover:bg-secondary/80 "
                  >
                    <div className="flex items-center gap-3">
                      <Database className="w-6 h-6" />
                      <span className="text-xl font-semibold">Database</span>
                    </div>
                    <ChevronRight className="w-6 h-6" />
                  </button>

                  <button
                    onClick={() => { if (isRateLimited("ai-integration-menu")) return; handleAIIntegration(); }}
                    className="w-full flex items-center justify-between p-5 rounded-xl bg-secondary hover:bg-secondary/80 "
                  >
                    <div className="flex items-center gap-3">
                      <Brain className="w-6 h-6" />
                      <span className="text-xl font-semibold">AI Integration</span>
                    </div>
                    <ChevronRight className="w-6 h-6" />
                  </button>

                  <button
                    onClick={() => { if (isRateLimited("idle-timeout-menu")) return; handleIdleTimeout(); }}
                    className="w-full flex items-center justify-between p-5 rounded-xl bg-secondary hover:bg-secondary/80 "
                  >
                    <div className="flex items-center gap-3">
                      <Timer className="w-6 h-6" />
                      <span className="text-xl font-semibold">Idle Timeout</span>
                    </div>
                    <ChevronRight className="w-6 h-6" />
                  </button>

                  {isSuperadmin && (
                    <button
                      onClick={() => { if (isRateLimited("accounts-menu")) return; handleAccounts(); }}
                      className="w-full flex items-center justify-between p-5 rounded-xl bg-secondary hover:bg-secondary/80 "
                    >
                      <div className="flex items-center gap-3">
                        <Shield className="w-6 h-6" />
                        <span className="text-xl font-semibold">Accounts</span>
                      </div>
                      <ChevronRight className="w-6 h-6" />
                    </button>
                  )}

                  <button
                    onClick={() => { if (isRateLimited("power-menu")) return; setShowPowerModal(true); }}
                    className="w-full flex items-center justify-between p-5 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive"
                  >
                    <div className="flex items-center gap-3">
                      <Power className="w-6 h-6" />
                      <span className="text-xl font-semibold">Power</span>
                    </div>
                    <ChevronRight className="w-6 h-6" />
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

      {showPowerModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
          <div className="bg-card rounded-3xl shadow-2xl p-8 w-full max-w-md border border-border/50">
            {powerAction === null ? (
              <>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="text-3xl font-bold">Power Options</h2>
                  <button
                    onClick={() => setShowPowerModal(false)}
                    className="p-2 rounded-full hover:bg-muted"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                <div className="space-y-3">
                  <button
                    onClick={() => { if (isRateLimited("power-shutdown")) return; setPowerAction("shutdown"); }}
                    className="w-full flex items-center gap-3 p-5 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive text-left"
                  >
                    <Power className="w-6 h-6" />
                    <span className="text-xl font-semibold">Shutdown</span>
                  </button>
                  <button
                    onClick={() => { if (isRateLimited("power-restart")) return; setPowerAction("restart"); }}
                    className="w-full flex items-center gap-3 p-5 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-700 text-left"
                  >
                    <RotateCw className="w-6 h-6" />
                    <span className="text-xl font-semibold">Restart</span>
                  </button>
                  <button
                    onClick={() => { if (isRateLimited("power-lock")) return; setPowerAction("lock"); }}
                    className="w-full flex items-center gap-3 p-5 rounded-xl bg-secondary hover:bg-secondary/80 text-left"
                  >
                    <Lock className="w-6 h-6" />
                    <span className="text-xl font-semibold">Lock</span>
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between items-center mb-6">
                  <button
                    onClick={() => setPowerAction(null)}
                    className="p-2 rounded-full hover:bg-muted"
                  >
                    <ChevronRight className="w-6 h-6 rotate-180" />
                  </button>
                  <h2 className="text-3xl font-bold">Confirm</h2>
                  <div className="w-10" />
                </div>
                <p className="text-center text-muted-foreground mb-6">
                  Are you sure you want to{" "}
                  {powerAction === "lock"
                    ? "lock the screen"
                    : powerAction === "restart"
                      ? "restart the system"
                      : "shut down the system"}
                  ?
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (isRateLimited("power-confirm")) return;
                      powerMutation.mutate(powerAction);
                    }}
                    disabled={powerMutation.isPending}
                    className="flex-1 h-14 rounded-xl bg-primary text-primary-foreground text-lg font-semibold flex items-center justify-center gap-2"
                  >
                    {powerMutation.isPending ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      "Confirm"
                    )}
                  </button>
                  <button
                    onClick={() => setPowerAction(null)}
                    className="flex-1 h-14 rounded-xl bg-secondary text-lg font-semibold"
                  >
                    Back
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
