import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Brain, Check, Cpu, Lightbulb, Loader2 } from "lucide-react";
import type { SettingsAccount } from "@/components/LoginDialog";

interface AIIntegrationSettingsProps {
  account: SettingsAccount | null;
  isRateLimited: (key: string) => boolean;
}

export function AIIntegrationSettings({ account, isRateLimited }: AIIntegrationSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: aiMode, isLoading: aiModeLoading } = useQuery({
    queryKey: ["ai-mode"],
    queryFn: async () => {
      const res = await fetch("/api/settings/ai-mode");
      if (!res.ok) throw new Error("Failed to fetch AI mode");
      const data = await res.json();
      return data.mode as string;
    },
  });

  const { data: recEnabled, isLoading: recLoading } = useQuery({
    queryKey: ["recommendation-enabled"],
    queryFn: async () => {
      const res = await fetch("/api/settings/recommendation");
      if (!res.ok) throw new Error("Failed to fetch recommendation setting");
      const data = await res.json();
      return data.enabled as boolean;
    },
  });

  const setRecMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const res = await fetch("/api/settings/recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      if (!res.ok) throw new Error("Failed to set recommendation");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["recommendation-enabled"] });
      toast({ title: "Recommendation setting updated" });
    },
    onError: () => {
      toast({
        title: "Failed to update recommendation setting",
        variant: "destructive",
      });
    },
  });

  const setAiModeMutation = useMutation({
    mutationFn: async (mode: string) => {
      const res = await fetch("/api/settings/ai-mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) throw new Error("Failed to set AI mode");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-mode"] });
      toast({ title: "AI mode updated" });
    },
    onError: () => {
      toast({ title: "Failed to update AI mode", variant: "destructive" });
    },
  });

  return (
    <div className="space-y-3">
      <div className="p-4 rounded-xl bg-secondary">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Lightbulb className="w-6 h-6" />
            <div>
              <span className="text-lg font-semibold block">Enable Recommendations</span>
              <span className="text-sm text-muted-foreground">
                {recLoading
                  ? "Loading..."
                  : recEnabled
                    ? "Recommendations are shown after each session"
                    : "No recommendations will be shown"}
              </span>
            </div>
          </div>
          <button
            onClick={() => {
              if (isRateLimited("rec-toggle")) return;
              setRecMutation.mutate(!recEnabled);
            }}
            disabled={recLoading || setRecMutation.isPending}
            className={`relative w-14 h-8 rounded-full transition-colors ${
              recEnabled ? "bg-primary" : "bg-muted-foreground/30"
            }`}
          >
            <div
              className={`absolute top-1 w-6 h-6 rounded-full bg-white shadow transition-transform ${
                recEnabled ? "left-7" : "left-1"
              }`}
            />
          </button>
        </div>
      </div>

      {aiModeLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8" />
        </div>
      ) : (
        <>
          <p className="text-sm text-muted-foreground mb-2">
            Select how health recommendations are generated:
          </p>
          <button
            onClick={() => {
              if (isRateLimited("ai-integrated")) return;
              setAiModeMutation.mutate("integrated");
            }}
            disabled={setAiModeMutation.isPending}
            className={`w-full flex items-center gap-3 p-4 rounded-xl text-left ${
              aiMode === "integrated"
                ? "bg-primary/10 border-2 border-primary"
                : "bg-secondary"
            }`}
          >
            <Brain className="w-6 h-6" />
            <div>
              <span className="text-lg font-semibold block">Integrated AI</span>
              <span className="text-sm text-muted-foreground">
                Uses Ollama AI model for dynamic recommendations
              </span>
            </div>
            {aiMode === "integrated" && <Check className="w-5 h-5 ml-auto text-primary" />}
          </button>
          <button
            onClick={() => {
              if (isRateLimited("ai-rulebased")) return;
              setAiModeMutation.mutate("rule-based");
            }}
            disabled={setAiModeMutation.isPending}
            className={`w-full flex items-center gap-3 p-4 rounded-xl text-left ${
              aiMode === "rule-based"
                ? "bg-primary/10 border-2 border-primary"
                : "bg-secondary"
            }`}
          >
            <Cpu className="w-6 h-6" />
            <div>
              <span className="text-lg font-semibold block">Rule-Based AI</span>
              <span className="text-sm text-muted-foreground">
                Uses predefined rules based on vital thresholds
              </span>
            </div>
            {aiMode === "rule-based" && <Check className="w-5 h-5 ml-auto text-primary" />}
          </button>
        </>
      )}
    </div>
  );
}
