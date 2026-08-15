import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, Loader2, Lock, Power, RotateCw, X } from "lucide-react";
import type { SettingsAccount } from "@/components/LoginDialog";
import { ReauthPrompt } from "./ReauthPrompt";

interface PowerSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  account: SettingsAccount | null;
  isRateLimited: (key: string) => boolean;
}

export function PowerSettings({ isOpen, onClose, account, isRateLimited }: PowerSettingsProps) {
  const { toast } = useToast();
  const [powerAction, setPowerAction] = useState<"shutdown" | "restart" | "lock" | null>(null);
  const [showReauth, setShowReauth] = useState(false);

  const powerMutation = useMutation({
    mutationFn: async (action: "shutdown" | "restart" | "lock") => {
      const res = await fetch("/api/settings/power", {
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
      onClose();
      setPowerAction(null);
    },
    onError: () => {
      toast({
        title: "Power command failed",
        description: "Could not send command",
        variant: "destructive",
      });
    },
  });

  const closeModal = () => {
    onClose();
    setPowerAction(null);
    setShowReauth(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-card rounded-3xl shadow-2xl p-8 w-full max-w-md border border-border/50">
        {powerAction === null ? (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold">Power Options</h2>
              <button onClick={closeModal} className="p-2 rounded-full hover:bg-muted">
                <X className="w-6 h-6" />
              </button>
            </div>
            <div className="space-y-3">
              <button
                onClick={() => {
                  if (isRateLimited("power-shutdown")) return;
                  setPowerAction("shutdown");
                }}
                className="w-full flex items-center gap-3 p-5 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive text-left"
              >
                <Power className="w-6 h-6" />
                <span className="text-xl font-semibold">Shutdown</span>
              </button>
              <button
                onClick={() => {
                  if (isRateLimited("power-restart")) return;
                  setPowerAction("restart");
                }}
                className="w-full flex items-center gap-3 p-5 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-700 text-left"
              >
                <RotateCw className="w-6 h-6" />
                <span className="text-xl font-semibold">Restart</span>
              </button>
              <button
                onClick={() => {
                  if (isRateLimited("power-lock")) return;
                  setPowerAction("lock");
                }}
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
              <button onClick={() => setPowerAction(null)} className="p-2 rounded-full hover:bg-muted">
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
                  setShowReauth(true);
                }}
                disabled={powerMutation.isPending}
                className="flex-1 h-14 rounded-xl bg-primary text-primary-foreground text-lg font-semibold flex items-center justify-center gap-2"
              >
                {powerMutation.isPending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Confirm"}
              </button>
              <button onClick={() => setPowerAction(null)} className="flex-1 h-14 rounded-xl bg-secondary text-lg font-semibold">
                Back
              </button>
            </div>
          </>
        )}
      </div>

      <ReauthPrompt
        open={showReauth}
        title="Authorize Power Command"
        description={`Re-enter your password to ${powerAction === "lock" ? "lock the screen" : powerAction === "restart" ? "restart the system" : "shut down the system"}.`}
        confirmLabel="Authorize"
        onClose={() => setShowReauth(false)}
        onConfirmed={() => {
          if (powerAction) powerMutation.mutate(powerAction);
        }}
      />
    </div>
  );
}
