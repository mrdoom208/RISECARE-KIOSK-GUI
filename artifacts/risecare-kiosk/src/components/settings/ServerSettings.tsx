import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Check, Globe, Loader2, Upload, X } from "lucide-react";
import type { SettingsAccount } from "@/components/LoginDialog";
import { ReauthPrompt } from "./ReauthPrompt";

interface ServerSettingsProps {
  isOpen: boolean;
  onClose: () => void;
  account: SettingsAccount | null;
  isRateLimited: (key: string) => boolean;
}

export function ServerSettings({ isOpen, onClose, account, isRateLimited }: ServerSettingsProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showExportReauth, setShowExportReauth] = useState(false);

  const { data: serverLink } = useQuery<{ link?: string }>({
    queryKey: ["server-link"],
    queryFn: async () => {
      const res = await fetch("/api/settings/server-link");
      if (!res.ok) throw new Error("Failed to fetch server link");
      return res.json();
    },
    enabled: isOpen,
  });

  const { data: serverConnection, refetch: refetchServerConnection } = useQuery<{
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
    enabled: isOpen,
    refetchInterval: 10000,
  });

  const [serverLinkInput, setServerLinkInput] = useState("");
  const [serverLinkSaved, setServerLinkSaved] = useState(false);

  useEffect(() => {
    if (isOpen && serverLink) {
      setServerLinkInput(serverLink.link ?? "");
    }
  }, [isOpen, serverLink]);

  const setServerLinkMutation = useMutation({
    mutationFn: async (link: string) => {
      const res = await fetch("/api/settings/server-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ link }),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || "Failed to save server link");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["server-link"] });
      refetchServerConnection();
      setServerLinkSaved(true);
      setTimeout(() => setServerLinkSaved(false), 3000);
      toast({ title: "Server link saved" });
    },
    onError: (err: any) => {
      toast({
        title: "Failed to save server link",
        description: err?.message,
        variant: "destructive",
      });
    },
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-card rounded-3xl shadow-2xl p-8 w-full max-w-md border border-border/50">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold">Server</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-muted">
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <Globe className="w-6 h-6 shrink-0" />
          <div className="min-w-0">
            <span className="text-lg font-semibold block">Server Link</span>
            <span className="text-sm text-muted-foreground block">
              Where reports are transferred
            </span>
          </div>
          <span
            className={`ml-auto text-sm px-3 py-1 rounded-full font-semibold shrink-0 ${
              serverConnection?.connected
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {serverConnection?.connected ? "Connected" : "Not connected"}
          </span>
        </div>

        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={serverLinkInput}
            onChange={(e) => {
              setServerLinkInput(e.target.value);
              setServerLinkSaved(false);
            }}
            placeholder="https://example.com/api/records"
            className="flex-1 h-12 min-w-0 px-4 text-lg rounded-xl bg-background border-2 border-border outline-none"
          />
          <button
            onClick={() => {
              if (isRateLimited("server-link-save")) return;
              setServerLinkMutation.mutate(serverLinkInput.trim());
            }}
            disabled={setServerLinkMutation.isPending}
            className="px-5 h-12 rounded-xl bg-primary text-primary-foreground text-lg font-bold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {setServerLinkMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : serverLinkSaved ? (
              <Check className="w-5 h-5" />
            ) : null}
            {setServerLinkMutation.isPending ? "Saving..." : serverLinkSaved ? "Saved" : "Save"}
          </button>
        </div>

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
      </div>

      <ReauthPrompt
        open={showExportReauth}
        title="Export Reports"
        description="Re-enter your password to authorize exporting reports to the server."
        onClose={() => setShowExportReauth(false)}
        onConfirmed={() => exportServerMutation.mutate()}
      />
    </div>
  );
}
