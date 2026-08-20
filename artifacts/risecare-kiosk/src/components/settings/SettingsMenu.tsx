import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Brain,
  CircleUserRound,
  FileText,
  Loader2,
  MonitorSmartphone,
  Power,
  Shield,
  Timer,
  Wifi,
  WifiOff,
} from "lucide-react";
import { SettingsMenuItem } from "./SettingsMenuItem";

export type SettingsSubmenu =
  | "profile"
  | "device"
  | "logs"
  | "accounts"
  | "ai-integration"
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
    refetchIntervalInBackground: true,
  });

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
              {networkStatusLoading ? (
                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
              ) : networkStatus?.online ? (
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
        <SettingsMenuItem
          icon={Brain}
          label="AI Integration"
          onClick={() => {
            if (isRateLimited("ai-integration-menu")) return;
            onNavigate("ai-integration");
          }}
          ariaLabel="Open AI Integration settings"
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
    </div>
  );
}
