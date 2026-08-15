import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Check, Loader2, Timer } from "lucide-react";
import type { SettingsAccount } from "@/components/LoginDialog";

interface IdleTimeoutSettingsProps {
  account: SettingsAccount | null;
  isRateLimited: (key: string) => boolean;
}

export function IdleTimeoutSettings({ account, isRateLimited }: IdleTimeoutSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [timeoutCooldown, setTimeoutCooldown] = useState(false);

  const { data: idleTimeoutSeconds, isLoading: timeoutLoading } = useQuery({
    queryKey: ["idle-timeout"],
    queryFn: async () => {
      const res = await fetch("/api/settings/idle-timeout");
      if (!res.ok) throw new Error("Failed to fetch idle timeout");
      const data = await res.json();
      return (data.seconds ?? 120) as number;
    },
  });

  const setIdleTimeoutMutation = useMutation({
    mutationFn: async (seconds: number) => {
      const res = await fetch("/api/settings/idle-timeout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seconds }),
      });
      if (!res.ok) throw new Error("Failed to set idle timeout");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["idle-timeout"] });
      toast({ title: "Idle timeout updated" });
    },
    onError: () => {
      toast({ title: "Failed to update idle timeout", variant: "destructive" });
    },
  });

  const handleIdleTimeoutSelect = (seconds: number) => {
    if (isRateLimited("idle-timeout")) {
      setTimeoutCooldown(true);
      setTimeout(() => setTimeoutCooldown(false), 1000);
      return;
    }
    setTimeoutCooldown(false);
    setIdleTimeoutMutation.mutate(seconds);
  };

  return (
    <div className="space-y-3">
      <div className="p-4 rounded-xl bg-secondary">
        <div className="flex items-center gap-3">
          <Timer className="w-6 h-6" />
          <div>
            <span className="text-lg font-semibold block">Idle Timeout</span>
            {timeoutLoading ? (
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading...
              </span>
            ) : setIdleTimeoutMutation.isPending ? (
              <span className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> Saving...
              </span>
            ) : timeoutCooldown ? (
              <span className="text-sm text-muted-foreground">
                Please wait a moment before changing again...
              </span>
            ) : (
              <span className="text-sm text-muted-foreground">
                Returns to home after {idleTimeoutSeconds} seconds of inactivity
              </span>
            )}
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground mb-1">
        Select how long to wait with no interaction before returning to the home screen:
      </p>

      {[30, 60, 120, 300, 600].map((opt) => (
        <button
          key={opt}
          onClick={() => handleIdleTimeoutSelect(opt)}
          disabled={setIdleTimeoutMutation.isPending || timeoutCooldown}
          className={`w-full flex items-center gap-3 p-4 rounded-xl text-left ${
            idleTimeoutSeconds === opt
              ? "bg-primary/10 border-2 border-primary"
              : "bg-secondary"
          } disabled:opacity-50`}
        >
          <Timer className="w-6 h-6" />
          <div>
            <span className="text-lg font-semibold block">
              {opt < 60 ? `${opt} seconds` : `${opt / 60} minute${opt === 60 ? "" : "s"}`}
            </span>
          </div>
          {setIdleTimeoutMutation.isPending && idleTimeoutSeconds === opt ? (
            <Loader2 className="w-5 h-5 ml-auto animate-spin text-primary" />
          ) : (
            idleTimeoutSeconds === opt && <Check className="w-5 h-5 ml-auto text-primary" />
          )}
        </button>
      ))}
    </div>
  );
}
