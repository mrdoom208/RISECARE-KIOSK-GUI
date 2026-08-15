import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  Brain,
  ChevronRight,
  CircleUserRound,
  Database,
  FileText,
  Loader2,
  Power,
  Shield,
  Timer,
  Wifi,
  WifiOff,
} from "lucide-react";
import type { SettingsAccount } from "@/components/LoginDialog";

export type SettingsSubmenu =
  | "profile"
  | "logs"
  | "database"
  | "accounts"
  | "ai-integration"
  | "idle-timeout"
  | "network";

interface SettingsMenuProps {
  account: SettingsAccount | null;
  isSuperadmin: boolean;
  isRateLimited: (key: string) => boolean;
  onNavigate: (submenu: SettingsSubmenu) => void;
  onOpenSensors: () => void;
  onOpenPower: () => void;
}

export function SettingsMenu({
  account,
  isSuperadmin,
  isRateLimited,
  onNavigate,
  onOpenSensors,
  onOpenPower,
}: SettingsMenuProps) {
  const { data: networkStatus, isLoading: networkStatusLoading } = useQuery<{
    online?: boolean;
    ssid?: string | null;
    ip?: string | null;
    signal?: number | null;
    device?: string | null;
    type?: string | null;
  }>({
    queryKey: ["network-status"],
    queryFn: async () => {
      const res = await fetch("/api/network/status");
      if (!res.ok) throw new Error("Failed to fetch network status");
      return res.json();
    },
    refetchInterval: 5000,
  });

  return (
    <div className="space-y-3">
      <button
        onClick={() => {
          if (isRateLimited("profile")) return;
          onNavigate("profile");
        }}
        className="w-full flex items-center justify-between p-5 rounded-xl bg-secondary hover:bg-secondary/80 "
      >
        <div className="flex items-center gap-3">
          <CircleUserRound className="w-6 h-6" />
          <span className="text-xl font-semibold">Profile</span>
        </div>
        <ChevronRight className="w-6 h-6" />
      </button>

      <button
        onClick={() => {
          if (isRateLimited("sensors")) return;
          onOpenSensors();
        }}
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
          onClick={() => {
            if (isRateLimited("activity-log")) return;
            onNavigate("logs");
          }}
          className="w-full flex items-center justify-between p-5 rounded-xl bg-secondary hover:bg-secondary/80 "
        >
          <div className="flex items-center gap-3">
            <FileText className="w-6 h-6" />
            <span className="text-xl font-semibold">Activity Log</span>
          </div>
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {isSuperadmin && (
        <button
          onClick={() => {
            if (isRateLimited("database")) return;
            onNavigate("database");
          }}
          className="w-full flex items-center justify-between p-5 rounded-xl bg-secondary hover:bg-secondary/80 "
        >
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6" />
            <span className="text-xl font-semibold">User Records</span>
          </div>

          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      <button
        onClick={() => {
          if (isRateLimited("ai-integration-menu")) return;
          onNavigate("ai-integration");
        }}
        className="w-full flex items-center justify-between p-5 rounded-xl bg-secondary hover:bg-secondary/80 "
      >
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6" />
          <span className="text-xl font-semibold">AI Integration</span>
        </div>
        <ChevronRight className="w-6 h-6" />
      </button>

      <button
        onClick={() => {
          if (isRateLimited("idle-timeout-menu")) return;
          onNavigate("idle-timeout");
        }}
        className="w-full flex items-center justify-between p-5 rounded-xl bg-secondary hover:bg-secondary/80 "
      >
        <div className="flex items-center gap-3">
          <Timer className="w-6 h-6" />
          <span className="text-xl font-semibold">Idle Timeout</span>
        </div>
        <ChevronRight className="w-6 h-6" />
      </button>

      <button
        onClick={() => {
          if (isRateLimited("network-menu")) return;
          onNavigate("network");
        }}
        className="w-full flex items-center justify-between p-5 rounded-xl bg-secondary hover:bg-secondary/80 "
      >
        <div className="flex items-center gap-3">
          <Wifi className="w-6 h-6" />
          <span className="text-xl font-semibold">Network Settings</span>
        </div>
        <div className="flex items-center gap-2">
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
          <ChevronRight className="w-6 h-6" />
        </div>
      </button>

      {isSuperadmin && (
        <button
          onClick={() => {
            if (isRateLimited("accounts-menu")) return;
            onNavigate("accounts");
          }}
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
        onClick={() => {
          if (isRateLimited("power-menu")) return;
          onOpenPower();
        }}
        className="w-full flex items-center justify-between p-5 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive"
      >
        <div className="flex items-center gap-3">
          <Power className="w-6 h-6" />
          <span className="text-xl font-semibold">Power</span>
        </div>
        <ChevronRight className="w-6 h-6" />
      </button>
    </div>
  );
}
