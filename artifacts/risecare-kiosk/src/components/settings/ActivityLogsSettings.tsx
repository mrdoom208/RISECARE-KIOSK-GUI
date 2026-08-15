import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { SettingsAccount } from "@/components/LoginDialog";

interface ActivityLogsSettingsProps {
  account: SettingsAccount | null;
}

export function ActivityLogsSettings({ account }: ActivityLogsSettingsProps) {
  const { data: activityLogs, isLoading: logsLoading } = useQuery({
    queryKey: ["activity-logs"],
    queryFn: async () => {
      const res = await fetch("/api/settings/logs");
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
  });

  return (
    <div>
      {logsLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8" />
        </div>
      ) : (
        <div className="space-y-2 max-h-[55vh] overflow-y-auto">
          {activityLogs?.length > 0 ? (
            activityLogs.map((log: any, i: number) => (
              <div key={i} className="p-4 rounded-lg bg-secondary text-base">
                <div className="flex justify-between items-start gap-3">
                  <p className="font-semibold">{log.action || "Unknown action"}</p>
                  <span className="text-sm bg-primary/10 text-primary px-3 py-1 rounded-full shrink-0">
                    {log.account_name || "Unknown"}
                  </span>
                </div>
                {log.details && (
                  <p className="text-muted-foreground text-sm mt-1.5">{log.details}</p>
                )}
                <p className="text-muted-foreground text-sm mt-1.5">
                  {log.created_at ? new Date(log.created_at).toLocaleString() : "Unknown time"}
                </p>
              </div>
            ))
          ) : (
            <p className="text-center text-muted-foreground py-10">No activity logs found</p>
          )}
        </div>
      )}
    </div>
  );
}
