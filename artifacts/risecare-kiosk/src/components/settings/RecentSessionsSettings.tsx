import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ListChecks } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { apiErrorMessage } from "@/lib/api-error";

interface RecentSessionsSettingsProps {
  isRateLimited: (key: string) => boolean;
}

export function RecentSessionsSettings({ isRateLimited }: RecentSessionsSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: recentSessionsSetting, isLoading } = useQuery<{ enabled: boolean }>({
    queryKey: ["recent-sessions-enabled"],
    queryFn: async () => {
      const res = await fetch("/api/settings/recent-sessions");
      if (!res.ok) throw new Error("Failed to fetch recent sessions setting");
      return res.json();
    },
  });
  const enabled = recentSessionsSetting?.enabled ?? true;

  const toggleMutation = useMutation({
    mutationFn: async (next: boolean) => {
      const res = await fetch("/api/settings/recent-sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(apiErrorMessage(data, "Failed to update recent sessions setting", res.status));
      }
      return data;
    },
    onSuccess: (data: { enabled?: boolean }) => {
      queryClient.setQueryData(["recent-sessions-enabled"], data);
      toast({
        title: data.enabled ? "Recent sessions shown" : "Recent sessions locked",
        description: data.enabled
          ? "Home shows recent sessions with masked names"
          : "The recent sessions widget stays locked on the home screen",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to update setting",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-xl bg-secondary">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 shrink-0 rounded-md bg-primary/10 flex items-center justify-center">
            <ListChecks className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-xl font-semibold">Show Recent Sessions</h3>
            <p className="text-sm text-muted-foreground">
              {isLoading
                ? "Loading..."
                : enabled
                  ? "Home shows recent sessions to everyone, with names masked (first letter only)"
                  : "The widget stays locked on the home screen; sessions stay hidden"}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span
              className={`text-xs font-bold tracking-wide ${
                enabled ? "text-green-600" : "text-muted-foreground"
              }`}
            >
              {enabled ? "ON" : "OFF"}
            </span>
            <Switch
              checked={enabled}
              disabled={toggleMutation.isPending || isLoading}
              onCheckedChange={(checked) => {
                if (isRateLimited("recent-sessions-toggle")) return;
                toggleMutation.mutate(checked === true);
              }}
              aria-label="Toggle recent sessions on the home screen"
              className="h-8 w-[52px] shrink-0 [&>span]:h-6! [&>span]:w-6! [&>span]:data-[state=checked]:translate-x-6! [&>span]:data-[state=unchecked]:translate-x-0!"
            />
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Patient privacy: while enabled, anyone can see that the kiosk is being used, but patient
        names stay masked. While disabled, the widget stays locked and only the sign-in prompt is
        shown.
      </p>
    </div>
  );
}
