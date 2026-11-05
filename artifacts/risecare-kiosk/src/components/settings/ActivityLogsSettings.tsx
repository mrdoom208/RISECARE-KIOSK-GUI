import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Loader2 } from "lucide-react";
import type { SettingsAccount } from "@/components/LoginDialog";

interface ActivityLogsSettingsProps {
  account: SettingsAccount | null;
}

interface ActivityLogEntry {
  id?: number;
  action?: string | null;
  details?: string | null;
  account_name?: string | null;
  created_at?: string | null;
}

function parseActivityDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatActivityTime(value: string | null | undefined): string {
  const date = parseActivityDate(value);
  return date ? date.toLocaleString() : "—";
}

export function ActivityLogsSettings({ account }: ActivityLogsSettingsProps) {
  const {
    data: activityLogs,
    isLoading,
    isError,
  } = useQuery<ActivityLogEntry[]>({
    queryKey: ["activity-logs"],
    queryFn: async () => {
      const res = await fetch("/api/settings/logs");
      if (!res.ok) throw new Error("Failed to load activity logs");
      return res.json();
    },
  });

  const logs = Array.isArray(activityLogs) ? activityLogs : [];

  return (
    <div>
      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-muted-foreground">
          Could not load activity logs. Please try again.
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
          <ClipboardList className="mx-auto w-8 h-8 text-muted-foreground" />
          <p className="mt-3 text-lg text-muted-foreground">
            No activity logs found
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-card">
          <div className="max-h-[55vh] overflow-y-auto overflow-x-hidden">
            <table
              aria-label="Activity logs"
              className="w-full table-fixed text-left text-[0.8125rem]"
            >
              <thead className="sticky top-0 z-10 bg-card">
                <tr className="border-b border-border/60 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                  <th scope="col" className="w-[24%] px-3 py-3 font-semibold">
                    Time
                  </th>
                  <th scope="col" className="w-[18%] px-3 py-3 font-semibold">
                    Account
                  </th>
                  <th scope="col" className="w-[22%] px-3 py-3 font-semibold">
                    Action
                  </th>
                  <th scope="col" className="px-3 py-3 font-semibold">
                    Details
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {logs.map((log, index) => (
                  <tr
                    key={log.id ?? index}
                    className="align-top transition-colors hover:bg-secondary/50"
                  >
                    <td className="break-words px-3 py-3 text-[0.7rem] text-muted-foreground">
                      {formatActivityTime(log.created_at)}
                    </td>
                    <td className="px-3 py-3">
                      <span className="inline-block max-w-full break-words rounded-full bg-primary/10 px-2.5 py-0.5 text-[0.7rem] font-semibold text-primary">
                        {log.account_name || "Unknown"}
                      </span>
                    </td>
                    <td className="break-words px-3 py-3 font-medium text-foreground">
                      {log.action || "Unknown action"}
                    </td>
                    <td className="break-words px-3 py-3 text-muted-foreground">
                      {log.details ? (
                        <span className="break-words">{log.details}</span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="border-t border-border/60 px-3 py-2 text-[0.7rem] text-muted-foreground">
            Showing the {logs.length} most recent{" "}
            {logs.length === 1 ? "entry" : "entries"}
            {account ? ` · Viewed by ${account.username}` : ""}
          </div>
        </div>
      )}
    </div>
  );
}
