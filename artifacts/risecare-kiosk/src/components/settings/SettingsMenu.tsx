import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Activity,
  CircleUserRound,
  DownloadCloud,
  FileText,
  Loader2,
  MonitorSmartphone,
  Power,
  RotateCw,
  Shield,
  Timer,
  Wifi,
  WifiOff,
} from "lucide-react";
import { SettingsMenuItem } from "./SettingsMenuItem";
import { ReauthPrompt } from "./ReauthPrompt";
import { apiErrorMessage } from "@/lib/api-error";

export type SettingsSubmenu =
  | "profile"
  | "device"
  | "logs"
  | "accounts"
  | "idle-timeout"
  | "network";

interface SettingsMenuProps {
  isSuperadmin: boolean;
  isRateLimited: (key: string) => boolean;
  onNavigate: (submenu: SettingsSubmenu) => void;
  onOpenSensors: () => void;
  onOpenPower: () => void;
}

function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="px-1 pt-1 text-xs font-bold uppercase tracking-widest text-muted-foreground">
      {children}
    </h3>
  );
}

function SettingsSection({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <section aria-label={`${label} settings`}>
      <SectionHeading>{label}</SectionHeading>
      <div className="mt-2 space-y-3">{children}</div>
    </section>
  );
}

export function SettingsMenu({
  isSuperadmin,
  isRateLimited,
  onNavigate,
  onOpenSensors,
  onOpenPower,
}: SettingsMenuProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showUpdateReauth, setShowUpdateReauth] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);
  const [updating, setUpdating] = useState(false);

  const {
    data: networkSetting,
    isLoading: networkSettingLoading,
  } = useQuery<{ enabled: boolean }>({
    queryKey: ["network-enabled"],
    queryFn: async () => {
      const res = await fetch("/api/settings/network-enabled");
      if (!res.ok) throw new Error("Failed to fetch network setting");
      return res.json();
    },
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
  });
  const networkEnabled = networkSetting?.enabled ?? true;

  const { data: networkStatus, isLoading: networkStatusLoading } = useQuery<{
    online?: boolean;
  }>({
    queryKey: ["network-status"],
    queryFn: async () => {
      const res = await fetch("/api/network/status");
      if (!res.ok) throw new Error("Failed to fetch network status");
      return res.json();
    },
    refetchInterval: 5000,
    // Only meaningful while the menu is on screen. Refetching in the background
    // re-rendered the settings subtree (and any focused field under it) every 5s
    // with no visible effect.
    refetchIntervalInBackground: false,
    enabled: networkEnabled,
  });

  const checkUpdateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/update/check");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(apiErrorMessage(data, "Failed to check for updates", res.status));
      }
      return res.json() as Promise<{ hasUpdate: boolean; localHash: string; remoteHash: string }>;
    },
    onSuccess: (data) => {
      setHasUpdate(!!data.hasUpdate);
      queryClient.invalidateQueries({ queryKey: ["network-status"] });
      if (data.hasUpdate) {
        toast({
          title: "Update available",
          description: "A new update is available. Click Update to apply.",
        });
      } else {
        toast({
          title: "Up to date",
          description: "No updates available",
        });
      }
    },
    onError: (err: any) => {
      toast({
        title: "Update check failed",
        description: err?.message || "Could not check for updates",
        variant: "destructive",
      });
    },
  });

  const applyUpdateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/update/apply", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(apiErrorMessage(data, "Failed to apply update", res.status));
      }
      return data;
    },
    onSuccess: () => {
      toast({
        title: "Updating System",
        description: "Applying updates and rebooting the Raspberry Pi...",
      });
      setUpdating(true);
    },
    onError: (err: any) => {
      toast({
        title: "Update failed",
        description: err?.message || "Could not apply update",
        variant: "destructive",
      });
      setUpdating(false);
    },
  });

  const handleCheckUpdate = () => {
    if (isRateLimited("update-check")) return;
    if (!networkEnabled) {
      toast({
        title: "Network disabled",
        description: "Enable network to check for updates",
        variant: "destructive",
      });
      return;
    }
    checkUpdateMutation.mutate();
  };

  const handleUpdateClick = () => {
    if (isRateLimited("update-apply")) return;
    if (!hasUpdate) {
      handleCheckUpdate();
      return;
    }
    setShowUpdateReauth(true);
  };

  const handleUpdateConfirmed = () => {
    applyUpdateMutation.mutate();
  };

  return (
    <div className="space-y-5">
      <SettingsSection label="General">
        <SettingsMenuItem
          icon={CircleUserRound}
          label="Profile"
          onClick={() => {
            if (isRateLimited("profile")) return;
            onNavigate("profile");
          }}
          ariaLabel="Open Profile settings"
        />
        <SettingsMenuItem
          icon={MonitorSmartphone}
          label="Device Information"
          onClick={() => {
            if (isRateLimited("device-info")) return;
            onNavigate("device");
          }}
          ariaLabel="Open Device Information settings"
        />
        <SettingsMenuItem
          icon={Wifi}
          label="Network Settings"
          onClick={() => {
            if (isRateLimited("network-menu")) return;
            onNavigate("network");
          }}
          ariaLabel="Open Network Settings"
          trailing={
            <span className="flex items-center gap-2" aria-live="polite">
              {networkSettingLoading || (networkEnabled && networkStatusLoading) ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : networkEnabled && networkStatus?.online ? (
                <span className="flex items-center gap-1.5 text-sm font-bold text-green-600">
                  <Wifi className="w-4 h-4" /> Online
                </span>
              ) : (
                <span className="flex items-center gap-1.5 text-sm font-bold text-red-500">
                  <WifiOff className="w-4 h-4" /> Offline
                </span>
              )}
            </span>
          }
        />
        <SettingsMenuItem
          icon={Timer}
          label="Idle Timeout"
          onClick={() => {
            if (isRateLimited("idle-timeout-menu")) return;
            onNavigate("idle-timeout");
          }}
          ariaLabel="Open Idle Timeout settings"
        />
      </SettingsSection>

      <SettingsSection label="System">
        <SettingsMenuItem
          icon={Activity}
          label="Sensors/Print Test"
          onClick={() => {
            if (isRateLimited("sensors")) return;
            onOpenSensors();
          }}
          ariaLabel="Open Sensors and Print Test"
        />
      </SettingsSection>

      {isSuperadmin && (
        <SettingsSection label="Administration">
          <SettingsMenuItem
            icon={FileText}
            label="Activity Log"
            onClick={() => {
              if (isRateLimited("activity-log")) return;
              onNavigate("logs");
            }}
            ariaLabel="Open Activity Log"
          />
          <SettingsMenuItem
            icon={Shield}
            label="Accounts"
            onClick={() => {
              if (isRateLimited("accounts-menu")) return;
              onNavigate("accounts");
            }}
            ariaLabel="Open Accounts settings"
          />
        </SettingsSection>
      )}

      {isSuperadmin && (
        <SettingsSection label="Updates">
          <SettingsMenuItem
            icon={hasUpdate ? DownloadCloud : RotateCw}
            label={hasUpdate ? "Update Available" : "Check for Updates"}
            onClick={handleUpdateClick}
            ariaLabel={hasUpdate ? "Apply update" : "Check for updates"}
            trailing={
              checkUpdateMutation.isPending ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : hasUpdate ? (
                <span className="text-sm font-bold text-primary">New</span>
              ) : undefined
            }
          />
        </SettingsSection>
      )}

      <SettingsSection label="System Power">
        <SettingsMenuItem
          icon={Power}
          label="Power"
          onClick={() => {
            if (isRateLimited("power-menu")) return;
            onOpenPower();
          }}
          ariaLabel="Open Power options"
          destructive
        />
      </SettingsSection>

      <ReauthPrompt
        open={showUpdateReauth}
        title="Apply Update"
        description="Re-enter your password to pull updates from main branch and reboot the Raspberry Pi."
        confirmLabel="Update & Reboot"
        onClose={() => setShowUpdateReauth(false)}
        onConfirmed={handleUpdateConfirmed}
      />
    </div>
  );
}
