import { useState } from "react";
import { ChevronRight, Eye, EyeOff, Loader2, LogOut, X } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { useRateLimit } from "@/hooks/use-rate-limit";
import type { SettingsAccount } from "@/components/LoginDialog";
import { SettingsMenu, type SettingsSubmenu } from "./SettingsMenu";
import { ActivityLogsSettings } from "./ActivityLogsSettings";
import { AccountsSettings } from "./AccountsSettings";
import { AIIntegrationSettings } from "./AIIntegrationSettings";
import { IdleTimeoutSettings } from "./IdleTimeoutSettings";
import { NetworkSettings } from "./NetworkSettings";
import { DatabaseSettings } from "./DatabaseSettings";
import { PowerSettings } from "./PowerSettings";
import { ProfileSettings } from "./ProfileSettings";
import { SensorsSettings } from "./SensorsSettings";

const MIN_PASSWORD_LENGTH = 12;

interface SettingsDialogProps {
  account: SettingsAccount | null;
  isOpen: boolean;
  onClose: () => void;
  onLogout: () => void;
}

export function SettingsDialog({ account, isOpen, onClose, onLogout }: SettingsDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { isRateLimited } = useRateLimit(800);

  const [step, setStep] = useState<"menu" | "create-admin" | "edit-account">(
    "menu",
  );
  const [activeSubmenu, setActiveSubmenu] = useState<SettingsSubmenu | null>(null);
  const isSuperadmin = account?.role === "superadmin";

  const [showSensors, setShowSensors] = useState(false);
  const [showPowerModal, setShowPowerModal] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const [creatingRole, setCreatingRole] = useState<"superadmin" | "admin">("admin");
  const [editingAccount, setEditingAccount] = useState<SettingsAccount | null>(null);
  const [adminUsername, setAdminUsername] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminRetryPassword, setAdminRetryPassword] = useState("");
  const [adminActiveField, setAdminActiveField] = useState<"passcode" | "retry">("passcode");
  const [adminError, setAdminError] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [showAdminRetryPassword, setShowAdminRetryPassword] = useState(false);

  const createAdminMutation = useMutation({
    mutationFn: async (data: {
      username: string;
      password: string;
      role: "superadmin" | "admin";
    }) => {
      const res = await fetch("/api/settings/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: data.username,
          password: data.password,
          role: data.role,
        }),
      });
      if (!res.ok) {
        let msg =
          data.role === "admin" ? "Failed to create admin" : "Failed to create super admin";
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
      toast({
        title: vars.role === "superadmin" ? "Super admin created" : "Admin created",
        description: "New account has been created",
      });
      resetAdminForm();
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setStep("menu");
    },
    onError: (err: Error) => {
      setAdminError(err.message);
    },
  });

  const updateAccountMutation = useMutation({
    mutationFn: async (data: {
      id: number;
      username: string;
      password: string;
      role: string;
    }) => {
      const res = await fetch(`/api/settings/accounts/${data.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: data.username,
          password: data.password,
          role: data.role,
        }),
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
      resetAdminForm();
      setEditingAccount(null);
      setAdminActiveField("passcode");
      queryClient.invalidateQueries({ queryKey: ["accounts"] });
      setStep("menu");
    },
    onError: (err: Error) => {
      setAdminError(err.message);
    },
  });

  const resetAdminForm = () => {
    setAdminUsername("");
    setAdminPassword("");
    setAdminRetryPassword("");
    setAdminError("");
    setAdminActiveField("passcode");
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
    if (adminPassword.length < MIN_PASSWORD_LENGTH) {
      setAdminError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
      return;
    }
    if (adminPassword !== adminRetryPassword) {
      setAdminError("Passwords do not match");
      return;
    }
    setAdminError("");
    createAdminMutation.mutate({
      username: adminUsername.trim(),
      password: adminPassword,
      role: creatingRole,
    });
  };

  const handleAdminPasscodeSubmit = () => {
    if (adminActiveField === "passcode") {
      if (!adminUsername.trim()) {
        setAdminError("Username is required");
        return;
      }
      if (adminPassword.length < MIN_PASSWORD_LENGTH) {
        setAdminError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
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
    if (adminPassword && adminPassword.length < MIN_PASSWORD_LENGTH) {
      setAdminError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`);
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

  const openEditAccount = (acc: SettingsAccount) => {
    setEditingAccount(acc);
    setCreatingRole(acc.role === "superadmin" ? "superadmin" : "admin");
    setAdminUsername(acc.username);
    setAdminPassword("");
    setAdminRetryPassword("");
    setAdminActiveField("passcode");
    setAdminError("");
    setStep("edit-account");
  };

  const openCreateAccount = () => {
    setCreatingRole("admin");
    setAdminActiveField("passcode");
    setStep("create-admin");
    setAdminError("");
  };

  const handleClose = () => {
    setActiveSubmenu(null);
    resetAdminForm();
    setCreatingRole("admin");
    setEditingAccount(null);
    setShowSensors(false);
    setShowPowerModal(false);
    setShowLogoutConfirm(false);
    onClose();
  };

  const handleLogout = () => {
    handleClose();
    onLogout();
  };

  const handleBack = () => {
    if (step === "create-admin" || step === "edit-account") {
      setStep("menu");
      setActiveSubmenu("accounts");
      setEditingAccount(null);
      resetAdminForm();
    } else if (activeSubmenu) {
      setActiveSubmenu(null);
    } else {
      handleClose();
    }
  };

  const showBackArrow =
    activeSubmenu !== null || step === "create-admin" || step === "edit-account";

  const title =
    step === "create-admin"
      ? creatingRole === "superadmin"
        ? "Create Super Admin"
        : "Create Admin"
      : step === "edit-account"
        ? "Edit Account"
        : activeSubmenu === "profile"
          ? "Profile"
          : activeSubmenu === "logs"
            ? "Activity Logs"
          : activeSubmenu === "database"
            ? "User Records"
            : activeSubmenu === "accounts"
              ? "Accounts"
              : activeSubmenu === "ai-integration"
                ? "AI Integration"
                : activeSubmenu === "idle-timeout"
                  ? "Idle Timeout"
                  : activeSubmenu === "network"
                    ? "Network Settings"
                    : "Settings";

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
          style={{ paddingBottom: "calc(1rem + var(--vk-height, 0px))" }}
        >
          <div className="bg-card rounded-3xl shadow-2xl p-6 sm:p-8 md:p-10 w-full max-w-2xl border border-border/50 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <button
                onClick={
                  showBackArrow
                    ? handleBack
                    : () => setShowLogoutConfirm(true)
                }
                className="p-2 rounded-full hover:bg-muted"
                aria-label={showBackArrow ? "Go back" : "Logout"}
              >
                {showBackArrow ? (
                  <ChevronRight className="w-6 h-6 rotate-180" />
                ) : (
                  <LogOut className="w-6 h-6" />
                )}
              </button>
              <h2 className="text-3xl font-bold">{title}</h2>
              <div className="w-10" />
            </div>

            {step === "create-admin" || step === "edit-account" ? (
              <>
                <div className="space-y-5 mb-6">
                  <div className="space-y-2">
                    <label className="text-lg font-semibold text-foreground">Role</label>
                    <select
                      value={creatingRole}
                      onChange={(e) => {
                        setCreatingRole(e.target.value as "superadmin" | "admin");
                        setAdminError("");
                      }}
                      className="w-full h-16 px-5 text-2xl rounded-md bg-background border-2 border-border outline-none"
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
                      onChange={(e) => {
                        setAdminUsername(e.target.value);
                        setAdminError("");
                      }}
                      placeholder="Enter username"
                      className="w-full h-16 px-5 text-2xl rounded-md bg-background border-2 border-border outline-none"
                    />
                  </div>

                  {step === "edit-account" ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-lg font-semibold text-foreground">
                          New Password
                        </label>
                        <div className="relative">
                          <input
                            type={showAdminPassword ? "text" : "password"}
                            value={adminPassword}
                            onChange={(e) => {
                              setAdminError("");
                              setAdminPassword(e.target.value);
                            }}
                            placeholder="Leave blank to keep current password"
                            className="w-full h-16 px-5 pr-16 text-2xl rounded-md bg-background border-2 border-primary/50 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowAdminPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-md text-muted-foreground hover:text-foreground"
                            aria-label={showAdminPassword ? "Hide password" : "Show password"}
                          >
                            {showAdminPassword ? (
                              <EyeOff className="w-6 h-6" />
                            ) : (
                              <Eye className="w-6 h-6" />
                            )}
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-lg font-semibold text-foreground">
                          Re-enter New Password
                        </label>
                        <div className="relative">
                          <input
                            type={showAdminRetryPassword ? "text" : "password"}
                            value={adminRetryPassword}
                            onChange={(e) => {
                              setAdminError("");
                              setAdminRetryPassword(e.target.value);
                            }}
                            placeholder="Re-enter new password"
                            className="w-full h-16 px-5 pr-16 text-2xl rounded-md bg-background border-2 border-primary/50 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowAdminRetryPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-md text-muted-foreground hover:text-foreground"
                            aria-label={showAdminRetryPassword ? "Hide password" : "Show password"}
                          >
                            {showAdminRetryPassword ? (
                              <EyeOff className="w-6 h-6" />
                            ) : (
                              <Eye className="w-6 h-6" />
                            )}
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
                          value={
                            adminActiveField === "passcode" ? adminPassword : adminRetryPassword
                          }
                          onChange={(e) => handleAdminValueChange(e.target.value)}
                          placeholder={adminActiveField === "retry" ? "Re-enter password" : "Enter password"}
                          className="w-full h-16 px-5 pr-16 text-2xl rounded-md bg-background border-2 border-primary/50 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => setShowAdminPassword((v) => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-md text-muted-foreground hover:text-foreground"
                          aria-label={showAdminPassword ? "Hide password" : "Show password"}
                        >
                          {showAdminPassword ? (
                            <EyeOff className="w-6 h-6" />
                          ) : (
                            <Eye className="w-6 h-6" />
                          )}
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
                      handleAdminPasscodeSubmit();
                    }
                  }}
                  disabled={
                    createAdminMutation.isPending ||
                    updateAccountMutation.isPending ||
                    !adminUsername.trim() ||
                    (step === "edit-account"
                      ? (adminPassword.length > 0 && adminPassword.length < MIN_PASSWORD_LENGTH) ||
                        (adminRetryPassword.length > 0 && adminRetryPassword.length < MIN_PASSWORD_LENGTH)
                      : adminActiveField === "passcode"
                        ? adminPassword.length < MIN_PASSWORD_LENGTH
                        : adminRetryPassword.length < MIN_PASSWORD_LENGTH)
                  }
                  className="w-full h-16 rounded-md bg-primary text-primary-foreground text-2xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
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
            ) : activeSubmenu === "profile" ? (
              <ProfileSettings account={account} />
            ) : activeSubmenu === "logs" ? (
              <ActivityLogsSettings account={account} />
            ) : activeSubmenu === "database" ? (
              <DatabaseSettings account={account} isRateLimited={isRateLimited} />
            ) : activeSubmenu === "accounts" ? (
              <AccountsSettings
                account={account}
                isRateLimited={isRateLimited}
                onCreateAccount={openCreateAccount}
                onEditAccount={openEditAccount}
              />
            ) : activeSubmenu === "ai-integration" ? (
              <AIIntegrationSettings account={account} isRateLimited={isRateLimited} />
            ) : activeSubmenu === "idle-timeout" ? (
              <IdleTimeoutSettings account={account} isRateLimited={isRateLimited} />
            ) : activeSubmenu === "network" ? (
              <NetworkSettings isRateLimited={isRateLimited} />
            ) : (
              <SettingsMenu
                account={account}
                isSuperadmin={isSuperadmin}
                isRateLimited={isRateLimited}
                onNavigate={setActiveSubmenu}
                onOpenSensors={() => setShowSensors(true)}
                onOpenPower={() => setShowPowerModal(true)}
              />
            )}
          </div>
        </div>
      )}

      <SensorsSettings isOpen={showSensors} onClose={() => setShowSensors(false)} />

      <PowerSettings
        isOpen={showPowerModal}
        onClose={() => setShowPowerModal(false)}
        account={account}
        isRateLimited={isRateLimited}
      />

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
          <div className="bg-card rounded-3xl shadow-2xl p-8 w-full max-w-md border border-border/50">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold">Logout</h2>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="p-2 rounded-full hover:bg-muted"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-center text-muted-foreground mb-6">
              Are you sure you want to logout?
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleLogout}
                className="flex-1 h-14 rounded-xl bg-destructive text-white text-lg font-semibold"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 h-14 rounded-xl bg-secondary text-lg font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
