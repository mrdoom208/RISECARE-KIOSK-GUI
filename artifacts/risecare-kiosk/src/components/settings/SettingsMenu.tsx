import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CircleUserRound,
  DownloadCloud,
  FileText,
  History,
  Info,
  Loader2,
  MonitorSmartphone,
  Power,
  RotateCw,
  ScrollText,
  Server,
  Shield,
  Timer,
  Wifi,
  WifiOff,
} from "lucide-react";
import { SettingsMenuItem } from "./SettingsMenuItem";
import { UpdateSettingsDialog } from "./UpdateSettingsDialog";

export type SettingsSubmenu =
  | "profile"
  | "device"
  | "logs"
  | "accounts"
  | "idle-timeout"
  | "recent-sessions"
  | "network"
  | "server-status"
  | "system-info"
  | "system-logs";

interface SettingsMenuProps {
  isOpen: boolean;
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
  isOpen,
  isSuperadmin,
  isRateLimited,
  onNavigate,
  onOpenSensors,
  onOpenPower,
}: SettingsMenuProps) {
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [hasUpdate, setHasUpdate] = useState(false);

  useEffect(() => {
    if (!isOpen) setShowUpdateDialog(false);
  }, [isOpen]);

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

  const openUpdateDialog = () => {
    if (isRateLimited("updates-menu")) return;
    setShowUpdateDialog(true);
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
        <SettingsMenuItem
          icon={History}
          label="Recent Sessions"
          onClick={() => {
            if (isRateLimited("recent-sessions-menu")) return;
            onNavigate("recent-sessions");
          }}
          ariaLabel="Open Recent Sessions settings"
        />
      </SettingsSection>

      <SettingsSection label="System">
        <SettingsMenuItem
          icon={Server}
          label="Server Status"
          onClick={() => {
            if (isRateLimited("server-status")) return;
            onNavigate("server-status");
          }}
          ariaLabel="Open Server Status"
        />
        <SettingsMenuItem
          icon={Info}
          label="System Information"
          onClick={() => {
            if (isRateLimited("system-info")) return;
            onNavigate("system-info");
          }}
          ariaLabel="Open System Information"
        />
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
            icon={ScrollText}
            label="System Logs"
            onClick={() => {
              if (isRateLimited("system-logs")) return;
              onNavigate("system-logs");
            }}
            ariaLabel="Open System Logs"
          />
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
            onClick={openUpdateDialog}
            ariaLabel={hasUpdate ? "Open update details" : "Check for updates"}
            trailing={
              hasUpdate ? (
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

      {isSuperadmin && (
        <UpdateSettingsDialog
          open={isOpen && showUpdateDialog}
          networkEnabled={networkEnabled}
          networkLoading={networkSettingLoading}
          isRateLimited={isRateLimited}
          onClose={() => setShowUpdateDialog(false)}
          onUpdateStatusChange={setHasUpdate}
        />
      )}
    </div>
  );
}
