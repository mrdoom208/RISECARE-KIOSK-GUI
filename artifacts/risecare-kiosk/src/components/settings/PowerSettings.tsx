import { memo, useCallback, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, Loader2, Lock, Power, RotateCw, X } from "lucide-react";
import type { SettingsAccount } from "@/components/LoginDialog";
import { ModalShell } from "@/components/ModalShell";
import { ReauthPrompt } from "./ReauthPrompt";

interface PowerSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  account: SettingsAccount | null;
  isRateLimited: (key: string) => boolean;
}

type PowerAction = "shutdown" | "restart" | "lock";

const CloseButton = memo(function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="p-2 rounded-full hover:bg-muted" aria-label="Close">
      <X className="w-6 h-6" />
    </button>
  );
});

const BackButton = memo(function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="p-2 rounded-full hover:bg-muted" aria-label="Go back">
      <ChevronRight className="w-6 h-6 rotate-180" />
    </button>
  );
});

const ActionList = memo(function ActionList({ onSelect }: { onSelect: (action: PowerAction) => void }) {
  return (
    <div className="space-y-3">
      <button
        onClick={() => onSelect("shutdown")}
        className="w-full flex items-center gap-3 p-5 rounded-xl bg-destructive/10 hover:bg-destructive/20 text-destructive text-left"
      >
        <Power className="w-6 h-6" />
        <span className="text-xl font-semibold">Shutdown</span>
      </button>
      <button
        onClick={() => onSelect("restart")}
        className="w-full flex items-center gap-3 p-5 rounded-xl bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-700 text-left"
      >
        <RotateCw className="w-6 h-6" />
        <span className="text-xl font-semibold">Restart</span>
      </button>
      <button
        onClick={() => onSelect("lock")}
        className="w-full flex items-center gap-3 p-5 rounded-xl bg-secondary hover:bg-secondary/80 text-left"
      >
        <Lock className="w-6 h-6" />
        <span className="text-xl font-semibold">Lock</span>
      </button>
    </div>
  );
});

const ConfirmList = memo(function ConfirmList({
  pending,
  onConfirm,
  onBack,
}: {
  pending: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  return (
    <div className="flex gap-2">
      <button
        onClick={onConfirm}
        disabled={pending}
        className="flex-1 h-14 rounded-xl bg-primary text-primary-foreground text-lg font-semibold flex items-center justify-center gap-2"
      >
        {pending ? <Loader2 className="w-6 h-6 animate-spin" /> : "Confirm"}
      </button>
      <button onClick={onBack} className="flex-1 h-14 rounded-xl bg-secondary text-lg font-semibold">
        Back
      </button>
    </div>
  );
});

const ACTION_PHRASE: Record<PowerAction, string> = {
  shutdown: "shut down the system",
  restart: "restart the system",
  lock: "lock the screen",
};

export const PowerSettings = memo(function PowerSettings({ isOpen, onClose, account, isRateLimited }: PowerSettingsProps) {
  const { toast } = useToast();
  const [powerAction, setPowerAction] = useState<PowerAction | null>(null);
  const [showReauth, setShowReauth] = useState(false);
  // Guards the reauth -> power hand-off: the prompt clears `submitting` before
  // the command lands, so without this a fast double-tap fires it twice.
  const [authorizing, setAuthorizing] = useState(false);

  const powerMutation = useMutation({
    mutationFn: async (action: PowerAction) => {
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
    onSettled: () => {
      setAuthorizing(false);
    },
  });

  const closeReauth = useCallback(() => setShowReauth(false), []);

  const closeModal = useCallback(() => {
    onClose();
    setPowerAction(null);
    setShowReauth(false);
    setAuthorizing(false);
  }, [onClose]);

  const handleSelect = useCallback(
    (action: PowerAction) => {
      if (isRateLimited(`power-${action}`)) return;
      setPowerAction(action);
    },
    [isRateLimited],
  );

  const handleConfirmClick = useCallback(() => {
    if (isRateLimited("power-confirm") || authorizing) return;
    setShowReauth(true);
  }, [authorizing, isRateLimited]);

  const handleConfirmed = useCallback(() => {
    if (powerAction && !authorizing) {
      setAuthorizing(true);
      powerMutation.mutate(powerAction);
    }
  }, [authorizing, powerAction, powerMutation]);

  const backToActions = useCallback(() => setPowerAction(null), []);

  const phrase = powerAction ? ACTION_PHRASE[powerAction] : "";

  return (
    <>
      <ModalShell
        open={isOpen}
        zIndex={60}
        backdrop="scrim"
        panelClassName="bg-card rounded-3xl shadow-2xl p-8 w-full max-w-md border border-border/50"
      >
        {powerAction === null ? (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold">Power Options</h2>
              <CloseButton onClick={closeModal} />
            </div>
            <ActionList onSelect={handleSelect} />
          </>
        ) : (
          <>
            <div className="flex justify-between items-center mb-6">
              <BackButton onClick={backToActions} />
              <h2 className="text-3xl font-bold">Confirm</h2>
              <div className="w-10" />
            </div>
            <p className="text-center text-muted-foreground mb-6">
              Are you sure you want to {phrase}?
            </p>
            <ConfirmList
              pending={authorizing || powerMutation.isPending}
              onConfirm={handleConfirmClick}
              onBack={backToActions}
            />
          </>
        )}
      </ModalShell>

      <ReauthPrompt
        open={showReauth}
        title="Authorize Power Command"
        description={`Re-enter your password to ${phrase || "run this command"}.`}
        confirmLabel="Authorize"
        onClose={closeReauth}
        onConfirmed={handleConfirmed}
      />
    </>
  );
});
