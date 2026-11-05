import { Fragment, useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { apiErrorMessage } from "@/lib/api-error";

interface SystemLogEntry {
  id: number;
  level: "INFO" | "WARNING" | "ERROR" | "DEBUG" | string;
  component: string;
  message: string;
  details: string | null;
  created_at: string;
}

interface SystemLogsResponse {
  logs: SystemLogEntry[];
  total: number;
  limit: number;
  offset: number;
  components: string[];
  retention: { days: number; maxEntries: number };
}

const LEVELS = ["ALL", "INFO", "WARNING", "ERROR", "DEBUG"] as const;
const PAGE_SIZE = 100;

function parseLogDate(value: string): Date | null {
  if (!value) return null;
  const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatLogDate(value: string): string {
  const date = parseLogDate(value);
  return date ? date.toLocaleDateString() : value || "--";
}

function formatLogClock(value: string): string {
  const date = parseLogDate(value);
  return date
    ? date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    : "--";
}

function formatLogTime(value: string): string {
  const date = parseLogDate(value);
  return date ? date.toLocaleString() : value || "--";
}

// The API stores timestamps in UTC. Convert the locally selected calendar day
// into UTC boundaries so the dates users pick match what they see in the table.
function toDateBoundary(value: string, endOfDay: boolean): string {
  if (!value) return "";
  const date = new Date(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`,
  );
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function humanizeDetailKey(key: string): string {
  const special: Record<string, string> = {
    api: "API",
    id: "ID",
    kb: "(KB)",
    mb: "(MB)",
    mqtt: "MQTT",
    ms: "(ms)",
    url: "URL",
  };

  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => {
      const replacement = special[part.toLowerCase()];
      if (replacement) return replacement;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.length > 0 ? value.map(formatDetailValue).join(", ") : "—";
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function LogDetails({ details }: { details: string | null }) {
  if (!details) {
    return (
      <p className="text-[0.8125rem] text-muted-foreground">
        No additional details were recorded for this entry.
      </p>
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(details);
  } catch {
    return (
      <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-secondary/60 p-2 font-mono text-[0.7rem] text-muted-foreground">
        {details}
      </pre>
    );
  }

  if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length === 0) {
      return (
        <p className="text-[0.8125rem] text-muted-foreground">
          No additional details were recorded for this entry.
        </p>
      );
    }
    return (
      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="min-w-0">
            <dt className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
              {humanizeDetailKey(key)}
            </dt>
            <dd className="mt-0.5 break-words font-mono text-[0.7rem] text-foreground">
              {formatDetailValue(value)}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-md bg-secondary/60 p-2 font-mono text-[0.7rem] text-muted-foreground">
      {typeof parsed === "string" ? parsed : JSON.stringify(parsed, null, 2)}
    </pre>
  );
}

function levelClasses(level: string): string {
  switch (level) {
    case "ERROR":
      return "bg-red-500/10 text-red-600";
    case "WARNING":
      return "bg-amber-500/10 text-amber-700";
    case "INFO":
      return "bg-blue-500/10 text-blue-700";
    default:
      return "bg-muted text-muted-foreground";
  }
}

export function SystemLogsSettings() {
  const { toast } = useToast();
  const [level, setLevel] = useState<(typeof LEVELS)[number]>("ALL");
  const [component, setComponent] = useState("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [page, setPage] = useState(1);
  const [expandedRows, setExpandedRows] = useState<Set<number>>(new Set());

  const toggleRow = (id: number) => {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const buildParams = (includeLimit: boolean) => {
    const params = new URLSearchParams();
    if (level !== "ALL") params.set("level", level);
    if (component !== "ALL") params.set("component", component);
    if (debouncedSearch) params.set("search", debouncedSearch);
    const from = toDateBoundary(fromDate, false);
    const to = toDateBoundary(toDate, true);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    if (includeLimit) {
      params.set("limit", String(PAGE_SIZE));
      params.set("offset", String((page - 1) * PAGE_SIZE));
    }
    return params;
  };

  const {
    data,
    isLoading,
    isError,
    isFetching,
    refetch,
  } = useQuery<SystemLogsResponse>({
    queryKey: [
      "system-logs",
      level,
      component,
      debouncedSearch,
      fromDate,
      toDate,
      page,
    ],
    queryFn: async () => {
      const res = await fetch(`/api/system/logs?${buildParams(true).toString()}`);
      if (!res.ok) throw new Error("Failed to load system logs");
      return res.json();
    },
    // Keep the current table mounted while a new filter/page loads. Without this
    // every filter change clears `data`, swaps the table for a spinner and
    // collapses the modal, which reads as a full reload.
    placeholderData: keepPreviousData,
    refetchInterval: 15000,
    refetchIntervalInBackground: false,
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/system/logs/export?${buildParams(false).toString()}`);
      if (!res.ok) {
        let message = "Failed to export system logs";
        try {
          const err = await res.json();
          message = apiErrorMessage(err, message, res.status);
        } catch {
          message = `Server error (${res.status})`;
        }
        throw new Error(message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `risecare-system-logs-${new Date().toISOString().slice(0, 10)}.txt`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Revoking immediately can cancel the download in some browsers.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
    onSuccess: () => {
      toast({
        title: "Logs exported",
        description: "The filtered system logs were saved as a .txt file",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Export failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const components =
    data?.components && data.components.length > 0
      ? data.components
      : ["Backend", "Database", "Sensor", "API", "Network", "Sync", "System"];

  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const rangeStart = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, total);

  // Retention pruning or a filter change can shrink the result set below the
  // current page; clamp back to the last available page when that happens.
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-3xl font-bold">System Logs</h2>
        <p className="mt-1 text-muted-foreground">
          Operational events from the backend, database, sensors and API.
        </p>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex items-start gap-2.5 rounded-lg bg-green-500/10 p-3 text-green-800">
          <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
          <p className="text-sm">
            Patient health information is never recorded here. Logs are kept for{" "}
            {data?.retention.days ?? 14} days (maximum{" "}
            {(data?.retention.maxEntries ?? 2000).toLocaleString()} entries) and are
            accessible to super admins only.
          </p>
        </div>

        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="relative sm:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search messages and details..."
              className="w-full h-11 pl-9 pr-4 rounded-md bg-background border-2 border-border outline-none text-sm"
              aria-label="Search system logs"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Level
            </label>
            <select
              value={level}
              onChange={(event) => {
                setLevel(event.target.value as (typeof LEVELS)[number]);
                setPage(1);
              }}
              className="w-full h-11 px-3 rounded-md bg-background border-2 border-border outline-none text-sm"
            >
              {LEVELS.map((option) => (
                <option key={option} value={option}>
                  {option === "ALL" ? "All levels" : option}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Component
            </label>
            <select
              value={component}
              onChange={(event) => {
                setComponent(event.target.value);
                setPage(1);
              }}
              className="w-full h-11 px-3 rounded-md bg-background border-2 border-border outline-none text-sm"
            >
              <option value="ALL">All components</option>
              {components.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="system-log-from-date"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              From date
            </label>
            <input
              id="system-log-from-date"
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(event) => {
                setFromDate(event.target.value);
                setPage(1);
              }}
              className="w-full h-11 px-3 rounded-md bg-background border-2 border-border outline-none text-sm"
            />
          </div>

          <div>
            <label
              htmlFor="system-log-to-date"
              className="mb-1 block text-xs font-semibold uppercase tracking-wide text-muted-foreground"
            >
              To date
            </label>
            <input
              id="system-log-to-date"
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(event) => {
                setToDate(event.target.value);
                setPage(1);
              }}
              className="w-full h-11 px-3 rounded-md bg-background border-2 border-border outline-none text-sm"
            />
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="w-3.5 h-3.5" />
            Dates use this device&apos;s local time.
          </p>
          {(fromDate || toDate) && (
            <button
              type="button"
              onClick={() => {
                setFromDate("");
                setToDate("");
                setPage(1);
              }}
              className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <X className="w-3.5 h-3.5" />
              Clear dates
            </button>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {data
            ? total === 0
              ? "No entries"
              : `Showing ${rangeStart.toLocaleString()}–${rangeEnd.toLocaleString()} of ${total.toLocaleString()} entr${total === 1 ? "y" : "ies"}`
            : "Loading entries..."}
        </p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            className="flex items-center gap-2 px-3 h-10 rounded-md bg-secondary hover:bg-secondary/80 text-sm font-semibold disabled:opacity-50"
            aria-label="Refresh system logs"
          >
            {isFetching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Refresh
          </button>
          <button
            onClick={() => exportMutation.mutate()}
            disabled={exportMutation.isPending || isLoading || isError}
            className="flex items-center gap-2 px-3 h-10 rounded-md bg-primary text-primary-foreground text-sm font-semibold disabled:opacity-50"
            aria-label="Export system logs as text file"
          >
            {exportMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            Export .txt
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-10">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : isError ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center text-muted-foreground">
          Could not load system logs. Check that the backend is running.
        </div>
      ) : !data || data.logs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 p-8 text-center">
          <FileText className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="mt-3 text-lg text-muted-foreground">
            No system logs match the current filters.
          </p>
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-y-auto overflow-x-hidden rounded-xl border border-border/60 bg-card">
          <table aria-label="System logs" className="w-full table-fixed text-left text-[0.8125rem]">
            <thead className="sticky top-0 z-10 bg-card">
              <tr className="border-b border-border/60 text-[0.7rem] uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="w-[18%] px-3 py-3 font-semibold">
                  Time
                </th>
                <th scope="col" className="w-[15%] px-3 py-3 font-semibold">
                  Level
                </th>
                <th scope="col" className="w-[17%] px-3 py-3 font-semibold">
                  Component
                </th>
                <th scope="col" className="w-[42%] px-3 py-3 font-semibold">
                  Message
                </th>
                <th scope="col" className="w-[8%] px-2 py-3 text-right font-semibold">
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {data.logs.map((log) => {
                const expanded = expandedRows.has(log.id);
                return (
                  <Fragment key={log.id}>
                    <tr
                      onClick={() => toggleRow(log.id)}
                      className={`cursor-pointer align-top transition-colors ${
                        expanded ? "bg-secondary/50" : "hover:bg-secondary/60"
                      }`}
                    >
                      <td className="break-words px-3 py-3 text-[0.7rem] text-muted-foreground">
                        <span className="block font-medium text-foreground">
                          {formatLogDate(log.created_at)}
                        </span>
                        <span className="mt-0.5 block font-mono">
                          {formatLogClock(log.created_at)}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={`inline-block max-w-full break-words rounded-full px-2.5 py-0.5 text-[0.7rem] font-bold tracking-wide ${levelClasses(log.level)}`}
                        >
                          {log.level}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="inline-block max-w-full break-words rounded-full bg-secondary px-2.5 py-0.5 text-[0.7rem] font-semibold text-muted-foreground">
                          {log.component}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <p
                          className={`font-medium break-words ${
                            expanded ? "" : "line-clamp-1"
                          }`}
                        >
                          {log.message}
                        </p>
                        {!expanded && log.details && (
                          <p className="mt-0.5 text-[0.7rem] text-muted-foreground">
                            Details available
                          </p>
                        )}
                      </td>
                      <td className="px-2 py-3 text-right">
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleRow(log.id);
                          }}
                          aria-expanded={expanded}
                          aria-label={`${expanded ? "Hide" : "Show"} details for log ${log.id}`}
                          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                        >
                          <ChevronDown
                            className={`w-4 h-4 transition-transform ${
                              expanded ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                      </td>
                    </tr>
                    {expanded && (
                      <tr className="bg-secondary/30">
                        <td colSpan={5} className="px-3 pb-4 pt-1">
                          <div className="space-y-3 rounded-lg bg-background/60 p-3">
                            <div>
                              <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                                Full message
                              </p>
                              <p className="mt-1 text-[0.8125rem] font-medium break-words whitespace-pre-wrap">
                                {log.message}
                              </p>
                            </div>
                            {log.details && (
                              <div>
                                <p className="text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground">
                                  Additional details
                                </p>
                                <div className="mt-1">
                                  <LogDetails details={log.details} />
                                </div>
                              </div>
                            )}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.7rem] text-muted-foreground">
                              <span>Log ID: {log.id}</span>
                              <span>Recorded: {formatLogTime(log.created_at)}</span>
                              <span>Level: {log.level}</span>
                              <span>Component: {log.component}</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {data && total > 0 && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setPage((current) => Math.max(1, current - 1))}
            disabled={currentPage <= 1 || isFetching}
            className="flex h-11 items-center gap-1 rounded-md bg-secondary px-4 text-sm font-semibold hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Previous page"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </button>
          <span className="text-sm font-semibold text-muted-foreground">
            Page {currentPage.toLocaleString()} of {totalPages.toLocaleString()}
          </span>
          <button
            type="button"
            onClick={() =>
              setPage((current) => Math.min(totalPages, current + 1))
            }
            disabled={currentPage >= totalPages || isFetching}
            className="flex h-11 items-center gap-1 rounded-md bg-secondary px-4 text-sm font-semibold hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label="Next page"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}
