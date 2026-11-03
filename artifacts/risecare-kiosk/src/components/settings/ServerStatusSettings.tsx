import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Database,
  HardDrive,
  HeartPulse,
  Loader2,
  Radio,
  RefreshCw,
  Server,
} from "lucide-react";

interface SystemStatus {
  online: boolean;
  status: "online" | "degraded";
  checkedAt: string;
  responseTimeMs: number;
  backend: {
    status: string;
    version: string;
    environment: string;
    uptimeSeconds: number;
  };
  api: { status: string };
  database: { status: "ok" | "error" };
  mqtt: { connected: boolean; broker: string };
  portal: { link: string | null };
  device: {
    kioskId: string | null;
    kioskName: string | null;
    kioskSite: string | null;
    activated: boolean;
    syncState: { pending: number; synced: number };
  } | null;
}

interface ServerConnection {
  connected: boolean;
  link: string | null;
  status?: number;
}

function formatUptime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "--";
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(1, minutes)}m`;
}

function StatusPill({
  ok,
  children,
  warning,
}: {
  ok: boolean;
  children: ReactNode;
  warning?: boolean;
}) {
  const tone = ok
    ? "bg-green-500/10 text-green-700"
    : warning
      ? "bg-amber-500/10 text-amber-700"
      : "bg-red-500/10 text-red-600";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-semibold ${tone}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}

function InfoCard({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border/60 bg-card p-5">
      <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
        <Icon className="w-4 h-4" />
        {title}
      </div>
      <div className="mt-3 space-y-1.5">{children}</div>
    </div>
  );
}

export function ServerStatusSettings() {
  const {
    data: status,
    isLoading,
    isError,
    refetch,
    isFetching,
    dataUpdatedAt,
  } = useQuery<SystemStatus>({
    queryKey: ["system-status-detail"],
    queryFn: async () => {
      const res = await fetch("/api/system/status");
      if (!res.ok) throw new Error("Failed to load server status");
      return res.json();
    },
    refetchInterval: 10000,
    refetchIntervalInBackground: false,
  });

  const {
    data: portal,
    isLoading: portalLoading,
    isFetching: portalFetching,
    refetch: refetchPortal,
  } = useQuery<ServerConnection>({
    queryKey: ["server-connection"],
    queryFn: async () => {
      const res = await fetch("/api/settings/server-connection");
      if (!res.ok) throw new Error("Failed to check server connection");
      return res.json();
    },
    retry: false,
    staleTime: 30000,
    refetchOnWindowFocus: false,
  });

  const healthy = !!status && status.status === "online" && status.database.status === "ok";
  const lastChecked = dataUpdatedAt
    ? new Date(dataUpdatedAt).toLocaleTimeString()
    : null;

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-3xl font-bold">Server Status</h2>
        <p className="mt-1 text-muted-foreground">
          Live health of the kiosk backend and its connected services.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`h-11 w-11 shrink-0 rounded-full flex items-center justify-center ${
                isLoading || isError
                  ? "bg-muted"
                  : healthy
                    ? "bg-green-500/10"
                    : "bg-amber-500/10"
              }`}
            >
              {isLoading ? (
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              ) : healthy ? (
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              ) : (
                <AlertTriangle className="w-6 h-6 text-amber-600" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xl font-bold">
                {isLoading
                  ? "Checking status..."
                  : isError
                    ? "Backend unreachable"
                    : healthy
                      ? "All systems operational"
                      : "Degraded"}
              </p>
              <p className="text-sm text-muted-foreground">
                {lastChecked ? `Last checked ${lastChecked}` : "Waiting for a response"}
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              refetch();
              refetchPortal();
            }}
            disabled={isFetching || portalFetching}
            className="flex items-center gap-2 px-4 h-11 rounded-md bg-secondary hover:bg-secondary/80 text-sm font-semibold shrink-0 disabled:opacity-50"
            aria-label="Refresh server status"
          >
            {isFetching || portalFetching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh
          </button>
        </div>
        {isError && (
          <p className="mt-3 text-sm text-red-600">
            Could not reach the local backend. Start the API server and try again.
          </p>
        )}
      </div>

      {status && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <InfoCard icon={Server} title="Backend">
            <p className="text-lg font-semibold">Reachable</p>
            <p className="text-sm text-muted-foreground">
              Version {status.backend.version} · {status.backend.environment}
            </p>
            <p className="text-sm text-muted-foreground">
              Uptime {formatUptime(status.backend.uptimeSeconds)}
            </p>
          </InfoCard>

          <InfoCard icon={HeartPulse} title="API Health">
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-semibold">Healthy</p>
              <StatusPill ok>OK</StatusPill>
            </div>
            <p className="text-sm text-muted-foreground">
              Local response in {status.responseTimeMs} ms
            </p>
          </InfoCard>

          <InfoCard icon={Database} title="Database">
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-semibold">
                {status.database.status === "ok" ? "Connected" : "Unavailable"}
              </p>
              <StatusPill ok={status.database.status === "ok"}>
                {status.database.status === "ok" ? "OK" : "Error"}
              </StatusPill>
            </div>
            <p className="text-sm text-muted-foreground">
              Local storage used for kiosk records and settings
            </p>
          </InfoCard>

          <InfoCard icon={Radio} title="MQTT / Sensors">
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-semibold">
                {status.mqtt.connected ? "Connected" : "Disconnected"}
              </p>
              <StatusPill ok={status.mqtt.connected} warning={!status.mqtt.connected}>
                {status.mqtt.connected ? "Online" : "Offline"}
              </StatusPill>
            </div>
            <p className="truncate text-sm text-muted-foreground">{status.mqtt.broker}</p>
          </InfoCard>

          <InfoCard icon={Cloud} title="RiseCare Portal">
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-semibold">
                {portalLoading
                  ? "Checking..."
                  : portal?.connected
                    ? "Connected"
                    : portal
                      ? "Not reachable"
                      : "Unknown"}
              </p>
              {portalLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <StatusPill ok={!!portal?.connected} warning={!portal}>
                  {portal?.connected ? "Online" : "Offline"}
                </StatusPill>
              )}
            </div>
            <p className="truncate text-sm text-muted-foreground">
              {portal?.link || status.portal.link || "Not configured"}
            </p>
            {portal?.status != null && (
              <p className="text-xs text-muted-foreground">HTTP {portal.status}</p>
            )}
          </InfoCard>

          <InfoCard icon={HardDrive} title="Kiosk Sync">
            <div className="flex items-center justify-between gap-2">
              <p className="text-lg font-semibold">
                {status.device?.activated ? "Activated" : "Not activated"}
              </p>
              <StatusPill ok={!!status.device?.activated} warning={!status.device?.activated}>
                {status.device?.activated ? "Linked" : "Local only"}
              </StatusPill>
            </div>
            <p className="text-sm text-muted-foreground">
              {status.device
                ? `${status.device.syncState.pending} pending · ${status.device.syncState.synced} synced`
                : "Device information unavailable"}
            </p>
          </InfoCard>
        </div>
      )}
    </div>
  );
}
