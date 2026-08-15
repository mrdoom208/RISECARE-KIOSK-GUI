import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { ChevronRight, Globe, Loader2, Upload } from "lucide-react";
import type { SettingsAccount } from "@/components/LoginDialog";
import { ServerSettings } from "./ServerSettings";
import { ReauthPrompt } from "./ReauthPrompt";

interface DatabaseSettingsProps {
  account: SettingsAccount | null;
  isRateLimited: (key: string) => boolean;
}

export function DatabaseSettings({ account, isRateLimited }: DatabaseSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showServerModal, setShowServerModal] = useState(false);
  const [showExportReauth, setShowExportReauth] = useState(false);

  const { data: serverConnection } = useQuery<{
    connected?: boolean;
    link?: string;
    status?: number;
  }>({
    queryKey: ["server-connection"],
    queryFn: async () => {
      const res = await fetch("/api/settings/server-connection");
      if (!res.ok) throw new Error("Failed to check server connection");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const exportServerMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/settings/export-server", { method: "POST" });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to export");
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["server-connection"] });
      toast({
        title: "Reports exported",
        description: `${data.exported ?? 0} session(s) sent to server`,
      });
    },
    onError: (err: any) => {
      toast({
        title: "Export failed",
        description: err?.message,
        variant: "destructive",
      });
    },
  });

  return (
    <div className="space-y-3">
      <button
        onClick={() => {
          if (isRateLimited("server-modal")) return;
          setShowServerModal(true);
        }}
        className="w-full flex items-center justify-between p-5 rounded-xl bg-secondary hover:bg-secondary/80 "
      >
        <div className="flex items-center gap-3">
          <Globe className="w-6 h-6" />
          <span className="text-xl font-semibold">Server</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`text-sm px-3 py-1 rounded-full font-semibold ${
              serverConnection?.connected
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {serverConnection?.connected ? "Connected" : "Not connected"}
          </span>
          <ChevronRight className="w-6 h-6" />
        </div>
      </button>
      <button
        onClick={() => {
          if (isRateLimited("export-server")) return;
          setShowExportReauth(true);
        }}
        disabled={!serverConnection?.connected || exportServerMutation.isPending}
        className="w-full flex items-center justify-center gap-3 p-5 rounded-xl bg-primary text-primary-foreground text-xl font-bold disabled:opacity-50"
      >
        {exportServerMutation.isPending ? (
          <Loader2 className="w-6 h-6 animate-spin" />
        ) : (
          <Upload className="w-6 h-6" />
        )}
        {exportServerMutation.isPending ? "Exporting..." : "Export Reports to Server"}
      </button>

      <ReauthPrompt
        open={showExportReauth}
        title="Export Reports"
        description="Re-enter your password to authorize exporting reports to the server."
        onClose={() => setShowExportReauth(false)}
        onConfirmed={() => exportServerMutation.mutate()}
      />

      <ServerSettings
        isOpen={showServerModal}
        onClose={() => setShowServerModal(false)}
        account={account}
        isRateLimited={isRateLimited}
      />
    </div>
  );
}
