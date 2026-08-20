import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Cable,
  ChevronRight,
  Loader2,
  RefreshCw,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface NetworkSettingsProps {
  isRateLimited: (key: string) => boolean;
}

interface NetworkStatus {
  online?: boolean;
  ssid?: string | null;
  ip?: string | null;
  signal?: number | null;
  device?: string | null;
  type?: string | null;
}

interface WifiNetwork {
  ssid: string;
  signal: number;
  security: string;
  inUse: boolean;
}

interface LanInterface {
  device: string;
  state: string;
  connected: boolean;
  connection?: string | null;
  ip?: string | null;
  mac?: string | null;
}

function SignalStrength({
  signal,
  className,
}: {
  signal?: number | null;
  className?: string;
}) {
  const value = Math.max(0, Math.min(100, signal ?? 0));
  const color =
    value >= 70 ? "bg-green-500" : value >= 40 ? "bg-amber-500" : "bg-red-500";
  return (
    <div
      className={`h-1.5 rounded-full bg-muted overflow-hidden ${className ?? "w-full"}`}
    >
      <div
        className={`h-full rounded-full ${color} transition-all`}
        style={{ width: `${value}%` }}
      />
    </div>
  );
}

function formatAgo(seconds: number) {
  if (seconds < 5) return "Updated just now";
  if (seconds < 60) return `Updated ${seconds} seconds ago`;
  const mins = Math.floor(seconds / 60);
  return `Updated ${mins} minute${mins === 1 ? "" : "s"} ago`;
}

export function NetworkSettings({ isRateLimited }: NetworkSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: networkSetting } = useQuery<{ enabled: boolean }>({
    queryKey: ["network-enabled"],
    queryFn: async () => {
      const res = await fetch("/api/settings/network-enabled");
      if (!res.ok) throw new Error("Failed to fetch network setting");
      return res.json();
    },
  });
  const networkEnabled = networkSetting?.enabled ?? true;

  const toggleNetworkMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch("/api/settings/network-enabled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to update");
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(["network-enabled"], data);
      toast({
        title: data.enabled ? "Network enabled" : "Network disabled",
        description: data.enabled
          ? "Wi-Fi management is turned on"
          : "Wi-Fi management is turned off",
      });
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  const toggleNetworkEnabled = (enabled: boolean) => {
    if (isRateLimited("network-toggle")) return;
    toggleNetworkMutation.mutate(enabled);
  };

  const {
    data: networkStatus,
    isLoading: networkStatusLoading,
  } = useQuery<NetworkStatus>({
    queryKey: ["network-status"],
    queryFn: async () => {
      const res = await fetch("/api/network/status");
      if (!res.ok) throw new Error("Failed to fetch network status");
      return res.json();
    },
    refetchInterval: 5000,
    enabled: networkEnabled,
  });

  const {
    data: wifiScan,
    refetch: refetchWifiScan,
    isFetching: wifiScanning,
    dataUpdatedAt: wifiScanUpdatedAt,
  } = useQuery<{ networks?: WifiNetwork[]; error?: string }>({
    queryKey: ["wifi-scan"],
    queryFn: async () => {
      const res = await fetch("/api/network/wifi/scan");
      if (!res.ok) throw new Error("Failed to scan networks");
      return res.json();
    },
    refetchInterval: 20000,
    enabled: networkEnabled,
  });

  const {
    data: lanStatus,
    isLoading: lanStatusLoading,
  } = useQuery<{ interfaces?: LanInterface[]; error?: string }>({
    queryKey: ["lan-status"],
    queryFn: async () => {
      const res = await fetch("/api/network/lan");
      if (!res.ok) throw new Error("Failed to fetch LAN interfaces");
      return res.json();
    },
    refetchInterval: 5000,
    enabled: networkEnabled,
  });

  const [connectTarget, setConnectTarget] = useState<{
    ssid: string;
    security: string;
  } | null>(null);
  const [wifiPassword, setWifiPassword] = useState("");
  const [wifiError, setWifiError] = useState("");

  const connectWifiMutation = useMutation({
    mutationFn: async ({
      ssid,
      password,
    }: {
      ssid: string;
      password?: string;
    }) => {
      const res = await fetch("/api/network/wifi/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ssid, password: password || undefined }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to connect");
      return data;
    },
    onSuccess: () => {
      setConnectTarget(null);
      setWifiPassword("");
      setWifiError("");
      queryClient.invalidateQueries({ queryKey: ["network-status"] });
      setTimeout(() => refetchWifiScan(), 3000);
      toast({ title: "Connected", description: "Network connected successfully" });
    },
    onError: (err: any) => {
      setWifiError(err?.message || "Failed to connect");
    },
  });

  const disconnectWifiMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/network/wifi/disconnect", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to disconnect");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["network-status"] });
      toast({ title: "Disconnected", description: "Wi-Fi connection removed" });
    },
    onError: () => {
      toast({ title: "Failed to disconnect", variant: "destructive" });
    },
  });

  const handleConnectWifi = () => {
    if (!connectTarget) return;
    setWifiError("");
    connectWifiMutation.mutate({
      ssid: connectTarget.ssid,
      password: wifiPassword.trim() || undefined,
    });
  };

  const handleScan = () => {
    if (isRateLimited("network-scan")) return;
    refetchWifiScan();
  };

  const networkCount = wifiScan?.networks?.length ?? 0;
  const updatedSeconds = wifiScanUpdatedAt
    ? Math.max(0, Math.round((now - wifiScanUpdatedAt) / 1000))
    : 0;

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-border/60 bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="h-10 w-10 shrink-0 rounded-md bg-primary/10 flex items-center justify-center">
              <Wifi className="h-5 w-5 text-primary" />
            </div>
            <div className="min-w-0">
              <h3 className="text-xl font-semibold">Network</h3>
              <p className="text-sm text-muted-foreground">
                Manage Wi-Fi and network connectivity
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-xs font-bold tracking-wide ${
                networkEnabled ? "text-green-600" : "text-muted-foreground"
              }`}
            >
              {networkEnabled ? "ON" : "OFF"}
            </span>
            <Switch
              checked={networkEnabled}
              disabled={toggleNetworkMutation.isPending}
              onCheckedChange={(checked) => toggleNetworkEnabled(checked === true)}
              className="h-8 w-[52px] shrink-0 [&>span]:h-6! [&>span]:w-6! [&>span]:data-[state=checked]:translate-x-6! [&>span]:data-[state=unchecked]:translate-x-0!"
            />
          </div>
        </div>
      </div>

      {!networkEnabled ? (
        <div className="rounded-md border border-dashed border-border/60 p-6 text-center">
          <WifiOff className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="mt-3 text-lg text-muted-foreground">
            Wi-Fi management is disabled. Turn on Network Connection to manage Wi-Fi.
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-md border border-border/60 bg-card p-5">
            {networkStatusLoading ? (
              <div className="animate-pulse space-y-3">
                <div className="h-6 w-40 rounded-md bg-muted" />
                <div className="h-4 w-56 rounded-md bg-muted" />
                <div className="h-2 w-full rounded-full bg-muted" />
              </div>
            ) : networkStatus?.online ? (
              <>
                <div className="flex items-center gap-2.5">
                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      networkStatus.type === "wifi" ? "bg-green-500" : "bg-blue-500"
                    }`}
                  />
                  <span className="text-lg font-semibold">Connected</span>
                  {networkStatus.type && (
                    <span className="text-sm font-medium capitalize text-muted-foreground">
                      · {networkStatus.type}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-xl font-semibold truncate">
                  {networkStatus.ssid ||
                    (networkStatus.type === "ethernet" ? "Ethernet" : "Network")}
                </p>
                {networkStatus.ip && (
                  <p className="text-sm text-muted-foreground">{networkStatus.ip}</p>
                )}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm mb-1.5">
                    <span className="text-muted-foreground">Signal</span>
                    <span className="font-medium">
                      {networkStatus.signal ?? "--"}%
                    </span>
                  </div>
                  <SignalStrength signal={networkStatus.signal} className="w-full" />
                </div>
                {networkStatus.type === "wifi" && (
                  <button
                    onClick={() => {
                      if (isRateLimited("network-disconnect")) return;
                      disconnectWifiMutation.mutate();
                    }}
                    disabled={disconnectWifiMutation.isPending}
                    className="mt-5 w-full flex items-center justify-center gap-2 px-4 h-12 rounded-md bg-destructive/10 hover:bg-destructive/20 text-destructive text-lg font-semibold disabled:opacity-50"
                  >
                    {disconnectWifiMutation.isPending
                      ? "Disconnecting..."
                      : "Disconnect"}
                  </button>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-red-500" />
                  <span className="text-lg font-semibold">Offline</span>
                </div>
                <p className="mt-2 text-muted-foreground">
                  No active network connection
                </p>
              </>
            )}
          </div>

          <div className="rounded-md border border-border/60 bg-card p-5">
            <div className="flex items-center gap-3 min-w-0">
              <div className="h-10 w-10 shrink-0 rounded-md bg-primary/10 flex items-center justify-center">
                <Cable className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <h3 className="text-xl font-semibold">Wired Connections</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {lanStatus?.error
                    ? "Failed to load wired connections"
                    : lanStatus?.interfaces?.length
                      ? `${lanStatus.interfaces.length} wired connection${lanStatus.interfaces.length === 1 ? "" : "s"}`
                      : "No wired connections detected"}
                </p>
              </div>
            </div>

            {lanStatus?.error && (
              <p className="mt-3 text-red-500 text-sm">{lanStatus.error}</p>
            )}

            <div className="mt-4 space-y-2">
              {lanStatusLoading && !lanStatus ? (
                <div className="animate-pulse space-y-3">
                  <div className="h-16 rounded-md bg-muted" />
                  <div className="h-16 rounded-md bg-muted" />
                </div>
              ) : lanStatus?.interfaces && lanStatus.interfaces.length > 0 ? (
                lanStatus.interfaces.map((iface) => (
                  <div
                    key={iface.device}
                    className={`flex items-center gap-4 p-4 rounded-md border ${
                      iface.connected
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-card"
                    }`}
                  >
                    <div
                      className={`h-10 w-10 shrink-0 rounded-md flex items-center justify-center ${
                        iface.connected ? "bg-blue-500/10" : "bg-muted"
                      }`}
                    >
                      <Cable
                        className={`h-5 w-5 ${iface.connected ? "text-blue-500" : "text-muted-foreground"}`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold truncate">
                          {iface.connection || iface.device}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize ${
                            iface.connected
                              ? "bg-green-500/10 text-green-600"
                              : "bg-muted text-muted-foreground"
                          }`}
                        >
                          {iface.connected ? "Connected" : iface.state}
                        </span>
                      </div>
                      <div className="text-sm text-muted-foreground truncate">
                        {iface.ip || "No IP address"} · {iface.device}
                        {iface.mac ? ` · ${iface.mac}` : ""}
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="p-4 text-center text-lg text-muted-foreground rounded-md border border-dashed border-border/60">
                  No wired connections found
                </p>
              )}
            </div>
          </div>

          <div className="rounded-md border border-border/60 bg-card p-5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-xl font-semibold">Available Networks</h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {networkCount > 0
                    ? `${networkCount} network${networkCount === 1 ? "" : "s"} found · ${formatAgo(updatedSeconds)}`
                    : wifiScan?.error
                      ? "Scan failed"
                      : "Scanning for networks..."}
                </p>
              </div>
              <button
                onClick={handleScan}
                disabled={wifiScanning}
                className="flex items-center gap-2 px-4 h-11 rounded-md bg-secondary hover:bg-secondary/80 text-lg font-semibold shrink-0 disabled:opacity-50"
              >
                {wifiScanning ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <RefreshCw className="w-5 h-5" />
                )}
                Scan
              </button>
            </div>

            {wifiScan?.error && (
              <p className="mt-3 text-red-500 text-sm">{wifiScan.error}</p>
            )}

            <div className="mt-4 space-y-2 max-h-[40vh] overflow-y-auto pr-1">
              {wifiScanning && !wifiScan ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : wifiScan?.networks && wifiScan.networks.length > 0 ? (
                wifiScan.networks.map((net) => (
                  <button
                    key={net.ssid}
                    onClick={() => {
                      if (isRateLimited("network-connect")) return;
                      if (net.inUse) return;
                      setConnectTarget({ ssid: net.ssid, security: net.security });
                      setWifiPassword("");
                      setWifiError("");
                    }}
                    disabled={net.inUse || connectWifiMutation.isPending}
                    className={`w-full flex items-center gap-4 p-4 rounded-md border text-left transition-colors disabled:opacity-60 ${
                      net.inUse
                        ? "border-primary/30 bg-primary/5 ring-1 ring-primary/20"
                        : "border-border bg-card hover:bg-muted/50"
                    }`}
                  >
                    <div className="h-10 w-10 shrink-0 rounded-md bg-primary/10 flex items-center justify-center">
                      <Wifi
                        className={`h-5 w-5 ${
                          net.inUse ? "text-primary" : "text-muted-foreground"
                        }`}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold truncate">{net.ssid}</span>
                        {net.inUse && (
                          <span className="shrink-0 rounded-full bg-green-500/10 px-2 py-0.5 text-xs font-medium text-green-600">
                            Connected
                          </span>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        {net.security}
                      </span>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="text-sm font-medium">{net.signal}%</span>
                      <SignalStrength signal={net.signal} className="mt-1 w-20" />
                    </div>
                    {!net.inUse && (
                      <ChevronRight className="w-5 h-5 text-muted-foreground shrink-0" />
                    )}
                  </button>
                ))
              ) : (
                <div className="p-6 text-center text-lg text-muted-foreground">
                  No networks found. Try scanning again.
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {connectTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm"
          style={{ paddingBottom: "calc(1rem + var(--vk-height, 0px))" }}
        >
          <div className="relative bg-card rounded-3xl shadow-2xl p-8 w-full max-w-md border border-border/50">
            <button
              onClick={() => {
                setConnectTarget(null);
                setWifiPassword("");
                setWifiError("");
              }}
              className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted shrink-0"
              aria-label="Close"
            >
              <X className="w-6 h-6" />
            </button>

            <div className="flex flex-col items-center mb-6">
              <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                <Wifi className="h-8 w-8 text-primary" />
              </div>
              <p className="text-sm font-medium text-muted-foreground">
                Connect to network
              </p>
              <h3 className="mt-1 text-2xl font-bold truncate max-w-full text-center">
                {connectTarget.ssid}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {connectTarget.security && connectTarget.security !== "Open"
                  ? `Secured with ${connectTarget.security}`
                  : "Open network"}
              </p>
            </div>

            {connectTarget.security && connectTarget.security !== "Open" ? (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-foreground">
                    Wi-Fi password
                  </label>
                  <input
                    type="password"
                    value={wifiPassword}
                    onChange={(e) => {
                      setWifiPassword(e.target.value);
                      setWifiError("");
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && wifiPassword.trim()) handleConnectWifi();
                    }}
                    placeholder="Enter Wi-Fi password"
                    className="w-full h-14 px-5 text-xl rounded-md bg-background border-2 border-border outline-none"
                    autoFocus
                  />
                </div>
                {wifiError && <p className="text-red-500 text-sm mt-2">{wifiError}</p>}
                <button
                  onClick={handleConnectWifi}
                  disabled={!wifiPassword.trim() || connectWifiMutation.isPending}
                  className="mt-4 w-full h-14 rounded-md bg-primary text-primary-foreground text-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {connectWifiMutation.isPending ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Wifi className="w-6 h-6" />
                  )}
                  Connect
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  This network is open (no password required).
                </p>
                <button
                  onClick={handleConnectWifi}
                  disabled={connectWifiMutation.isPending}
                  className="w-full h-14 rounded-md bg-primary text-primary-foreground text-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {connectWifiMutation.isPending ? (
                    <Loader2 className="w-6 h-6 animate-spin" />
                  ) : (
                    <Wifi className="w-6 h-6" />
                  )}
                  Connect
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
