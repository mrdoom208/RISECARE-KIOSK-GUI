import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import {
  Cpu,
  HardDrive,
  Loader2,
  MonitorSmartphone,
  Server,
  Clock,
} from "lucide-react";

interface SystemInfo {
  service: string;
  version: string;
  commit: string | null;
  environment: string;
  nodeVersion: string;
  platform: string;
  architecture: string;
  hostname: string;
  processUptimeSeconds: number;
  systemUptimeSeconds: number;
  startedAt: string;
  memory: {
    processRssBytes: number;
    heapUsedBytes: number;
    systemTotalBytes: number;
    systemFreeBytes: number;
  };
  storage: {
    databaseBytes: number;
    diskTotalBytes: number | null;
    diskFreeBytes: number | null;
  };
  device: {
    deviceUid: string;
    kioskId: string | null;
    kioskName: string | null;
    kioskSite: string | null;
    activated: boolean;
    createdAt: string | null;
    syncState: { pending: number; synced: number };
  } | null;
}

function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes)) return "--";
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let i = 1; i < units.length && value >= 1024; i += 1) {
    value /= 1024;
    unit = units[i];
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${unit}`;
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

function formatDate(value: string | null): string {
  if (!value) return "--";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "--" : date.toLocaleString();
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-right break-words">{value}</span>
    </div>
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
      <div className="mt-3 space-y-2">{children}</div>
    </div>
  );
}

export function SystemInformationSettings() {
  const { data: info, isLoading, isError, refetch, isFetching } = useQuery<SystemInfo>({
    queryKey: ["system-info"],
    queryFn: async () => {
      const res = await fetch("/api/system/info");
      if (!res.ok) throw new Error("Failed to load system information");
      return res.json();
    },
    refetchInterval: 30000,
    refetchIntervalInBackground: false,
  });

  const diskTotal = info?.storage.diskTotalBytes ?? null;
  const diskFree = info?.storage.diskFreeBytes ?? null;
  const diskUsed = diskTotal != null && diskFree != null ? diskTotal - diskFree : null;
  const diskPercent =
    diskTotal && diskUsed != null && diskTotal > 0
      ? Math.min(100, Math.round((diskUsed / diskTotal) * 100))
      : null;
  const diskTone =
    diskPercent == null
      ? "bg-muted"
      : diskPercent >= 90
        ? "bg-red-500"
        : diskPercent >= 75
          ? "bg-amber-500"
          : "bg-green-500";

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-3xl font-bold">System Information</h2>
          <p className="mt-1 text-muted-foreground">
            Device identity, software version, uptime and storage.
          </p>
        </div>
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-2 px-4 h-11 rounded-md bg-secondary hover:bg-secondary/80 text-sm font-semibold shrink-0 disabled:opacity-50"
          aria-label="Refresh system information"
        >
          {isFetching ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Clock className="w-4 h-4" />
          )}
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border/60 bg-card p-5 animate-pulse">
              <div className="h-5 w-32 rounded-md bg-muted" />
              <div className="mt-3 h-6 w-3/4 rounded-md bg-muted" />
            </div>
          ))}
        </div>
      ) : isError || !info ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-muted-foreground">
          Could not load system information. Check that the backend is running.
        </div>
      ) : (
        <div className="space-y-3">
          <InfoCard icon={MonitorSmartphone} title="Device">
            <InfoRow label="Kiosk ID" value={info.device?.kioskId || "Not assigned"} />
            {info.device?.kioskName && (
              <InfoRow label="Name" value={info.device.kioskName} />
            )}
            {info.device?.kioskSite && (
              <InfoRow label="Site" value={info.device.kioskSite} />
            )}
            <InfoRow
              label="Activation"
              value={info.device?.activated ? "Activated" : "Not activated"}
            />
            {info.device && (
              <InfoRow
                label="Sync state"
                value={`${info.device.syncState.pending} pending · ${info.device.syncState.synced} synced`}
              />
            )}
            {info.device && (
              <p className="pt-1 text-xs text-muted-foreground break-all">
                Device UID: {info.device.deviceUid}
              </p>
            )}
          </InfoCard>

          <InfoCard icon={Server} title="Software">
            <InfoRow label="Service" value={info.service} />
            <InfoRow
              label="Version"
              value={`${info.version}${info.commit ? ` (${info.commit})` : ""}`}
            />
            <InfoRow label="Environment" value={info.environment} />
            <InfoRow label="Node.js" value={info.nodeVersion} />
            <InfoRow label="Platform" value={`${info.platform} · ${info.architecture}`} />
            <InfoRow label="Hostname" value={info.hostname} />
            <InfoRow label="Started" value={formatDate(info.startedAt)} />
            <InfoRow label="Process uptime" value={formatUptime(info.processUptimeSeconds)} />
            <InfoRow label="System uptime" value={formatUptime(info.systemUptimeSeconds)} />
          </InfoCard>

          <InfoCard icon={Cpu} title="Memory">
            <InfoRow label="Kiosk process (RSS)" value={formatBytes(info.memory.processRssBytes)} />
            <InfoRow label="Heap used" value={formatBytes(info.memory.heapUsedBytes)} />
            <InfoRow label="System total" value={formatBytes(info.memory.systemTotalBytes)} />
            <InfoRow label="System free" value={formatBytes(info.memory.systemFreeBytes)} />
          </InfoCard>

          <InfoCard icon={HardDrive} title="Storage">
            <InfoRow label="Database file" value={formatBytes(info.storage.databaseBytes)} />
            <InfoRow
              label="Disk used"
              value={
                diskUsed != null && diskTotal != null
                  ? `${formatBytes(diskUsed)} of ${formatBytes(diskTotal)}`
                  : "Unavailable"
              }
            />
            <InfoRow label="Disk free" value={formatBytes(diskFree)} />
            <div className="pt-2">
              <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={`h-full rounded-full transition-all ${diskTone}`}
                  style={{ width: `${diskPercent ?? 0}%` }}
                />
              </div>
              <p className="mt-1.5 text-xs text-muted-foreground">
                {diskPercent != null ? `${diskPercent}% used` : "Disk usage unavailable"}
              </p>
            </div>
          </InfoCard>
        </div>
      )}
    </div>
  );
}
