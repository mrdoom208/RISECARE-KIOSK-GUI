import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  Check,
  Cpu,
  Fingerprint,
  HardDrive,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import type { SettingsAccount } from "@/components/LoginDialog";
import { ReauthPrompt } from "./ReauthPrompt";

interface DeviceInfo {
  deviceUid: string;
  kioskId: string | null;
  kioskName: string | null;
  kioskSite: string | null;
  activated: boolean;
  apiKeyConfigured: boolean;
  createdAt: string | null;
  syncState: { pending: number; synced: number };
}

interface DeviceInformationSettingsProps {
  account: SettingsAccount | null;
  isRateLimited: (key: string) => boolean;
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => undefined);
      }}
      className="flex items-center gap-1.5 rounded-md bg-muted px-2.5 py-1 text-xs font-medium text-muted-foreground hover:text-foreground shrink-0"
      aria-label={`Copy ${label}`}
    >
      {copied ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Fingerprint className="w-3.5 h-3.5" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function DeviceInformationSettings({
  account,
  isRateLimited,
}: DeviceInformationSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showActivateReauth, setShowActivateReauth] = useState(false);
  const isSuperadmin = account?.role === "superadmin";

  const { data: device, isLoading } = useQuery<DeviceInfo>({
    queryKey: ["device-info"],
    queryFn: async () => {
      const res = await fetch("/api/device/info");
      if (!res.ok) throw new Error("Failed to fetch device information");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const [activationCodeInput, setActivationCodeInput] = useState("");

  const activateMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/device/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activationCode: activationCodeInput.trim() }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to activate device");
      return data as DeviceInfo;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["device-info"] });
      setActivationCodeInput("");
      toast({ title: "Device activated", description: "This kiosk is now linked to the server" });
    },
    onError: (err: Error) => {
      toast({ title: "Activation failed", description: err.message, variant: "destructive" });
    },
  });

  const handleActivateClick = () => {
    if (isRateLimited("device-activate")) return;
    if (!activationCodeInput.trim()) {
      toast({ title: "Activation code required", description: "Enter the code issued by the server admin", variant: "destructive" });
      return;
    }
    setShowActivateReauth(true);
  };

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-3xl font-bold">Device Information</h2>
        <p className="mt-1 text-muted-foreground">
          Permanent identity of this physical kiosk.
        </p>
      </div>

      {isLoading || !device ? (
        <div className="space-y-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="rounded-xl border border-border/60 bg-card p-5 animate-pulse">
              <div className="h-5 w-28 rounded-md bg-muted" />
              <div className="mt-3 h-6 w-3/4 rounded-md bg-muted" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="rounded-xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <Cpu className="w-4 h-4" />
              Kiosk ID
            </div>
            {device.kioskId ? (
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-2xl font-bold tracking-wide">
                  {device.kioskId}
                </span>
                <CopyButton value={device.kioskId} label="kiosk ID" />
              </div>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">
                Not assigned yet. Assigned by the server when this kiosk is activated.
              </p>
            )}
            {device.kioskName && (
              <p className="mt-1 text-sm font-medium">Name: {device.kioskName}</p>
            )}
            {device.kioskSite && (
              <p className="mt-1 text-sm text-muted-foreground">Site: {device.kioskSite}</p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              Human/admin-facing identifier assigned by the server. Never chosen by the kiosk.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <ShieldCheck className="w-4 h-4" />
              Device UID
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="min-w-0 truncate font-mono text-lg font-semibold">
                {device.deviceUid}
              </span>
              <CopyButton value={device.deviceUid} label="device UID" />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Permanent identity, generated on first install. Never changes.
            </p>
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <KeyRound className="w-4 h-4" />
              Activation
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ${
                  device.activated
                    ? "bg-green-100 text-green-700"
                    : "bg-amber-500/10 text-amber-700"
                }`}
              >
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
                {device.activated ? "Activated" : "Not activated"}
              </span>
              <span className="text-sm text-muted-foreground">
                {device.activated
                  ? "Provisioned and linked to the server"
                  : "Enter the code issued by the server admin"}
              </span>
            </div>
            {isSuperadmin && !device.activated && (
              <div className="mt-4 space-y-2">
                <input
                  type="text"
                  value={activationCodeInput}
                  onChange={(e) => setActivationCodeInput(e.target.value)}
                  placeholder="Enter activation key (RC-…)"
                  className="w-full h-12 px-4 text-lg font-mono rounded-xl bg-background border-2 border-border outline-none"
                />
                <button
                  onClick={handleActivateClick}
                  disabled={activateMutation.isPending}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-primary-foreground text-lg font-semibold disabled:opacity-50"
                >
                  {activateMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <ShieldCheck className="w-5 h-5" />
                  )}
                  {activateMutation.isPending ? "Activating..." : "Activate Kiosk"}
                </button>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border/60 bg-card p-5">
            <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
              <HardDrive className="w-4 h-4" />
              Sync State
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-secondary p-3">
                <span className="block text-sm text-muted-foreground">Pending</span>
                <span className="block text-3xl font-bold">{device.syncState.pending}</span>
              </div>
              <div className="rounded-lg bg-secondary p-3">
                <span className="block text-sm text-muted-foreground">Synced</span>
                <span className="block text-3xl font-bold">{device.syncState.synced}</span>
              </div>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              Offline records wait locally as pending until the server confirms them.
            </p>
          </div>
        </>
      )}

      <ReauthPrompt
        open={showActivateReauth}
        title="Activate Device"
        description="Re-enter your password to send the activation code to the configured server and provision this kiosk."
        onClose={() => setShowActivateReauth(false)}
        onConfirmed={() => activateMutation.mutate()}
      />
    </div>
  );
}
