import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  DownloadCloud,
  Loader2,
  RefreshCw,
  WifiOff,
  X,
} from "lucide-react";
import { ModalShell } from "@/components/ModalShell";
import { apiErrorMessage } from "@/lib/api-error";
import { Z_INDEX } from "@/lib/z-index";
import { ReauthPrompt } from "./ReauthPrompt";

interface CommitInfo {
  hash: string;
  shortHash: string;
  subject: string;
  date: string;
  author: string;
}

interface UpdateCheckResult {
  hasUpdate: boolean;
  localHash: string;
  remoteHash: string;
  local: CommitInfo | null;
  remote: CommitInfo | null;
}

interface UpdateSettingsDialogProps {
  open: boolean;
  networkEnabled: boolean;
  networkLoading?: boolean;
  isRateLimited: (key: string) => boolean;
  onClose: () => void;
  onUpdateStatusChange?: (hasUpdate: boolean) => void;
}

function formatCommitDate(value: string | null | undefined): string {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function CommitSummary({
  label,
  commit,
  tone = "muted",
}: {
  label: string;
  commit: CommitInfo | null;
  tone?: "muted" | "primary";
}) {
  if (!commit) {
    return (
      <div
        className={`rounded-2xl border p-4 ${
          tone === "primary"
            ? "border-primary/30 bg-primary/5"
            : "border-border/60 bg-secondary/40"
        }`}
      >
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className="mt-2 text-base text-muted-foreground">Commit details unavailable</p>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border p-4 ${
        tone === "primary"
          ? "border-primary/30 bg-primary/5"
          : "border-border/60 bg-secondary/40"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <span className="shrink-0 rounded-md bg-background/70 px-2 py-0.5 font-mono text-xs font-semibold">
          {commit.shortHash}
        </span>
      </div>
      <p className="mt-2 break-words text-base font-semibold leading-snug">
        {commit.subject}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {formatCommitDate(commit.date)}
        {commit.author ? ` · ${commit.author}` : ""}
      </p>
    </div>
  );
}

export function UpdateSettingsDialog({
  open,
  networkEnabled,
  networkLoading = false,
  isRateLimited,
  onClose,
  onUpdateStatusChange,
}: UpdateSettingsDialogProps) {
  const [showReauth, setShowReauth] = useState(false);
  const [applied, setApplied] = useState(false);
  const [applyError, setApplyError] = useState("");
  const autoCheckedRef = useRef(false);

  const { data: info, isLoading: infoLoading } = useQuery<{
    local: CommitInfo | null;
  }>({
    queryKey: ["update-info"],
    queryFn: async () => {
      const res = await fetch("/api/settings/update/info");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(apiErrorMessage(data, "Failed to load build details", res.status));
      }
      return data;
    },
    enabled: open,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const {
    mutate: runCheck,
    isPending: checking,
    data: checkResult,
    error: checkError,
    reset: resetCheck,
  } = useMutation<UpdateCheckResult, Error>({
    mutationFn: async () => {
      const res = await fetch("/api/settings/update/check");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(apiErrorMessage(data, "Failed to check for updates", res.status));
      }
      return data as UpdateCheckResult;
    },
    onSuccess: (data) => {
      onUpdateStatusChange?.(!!data.hasUpdate);
    },
  });

  const {
    mutate: applyUpdate,
    isPending: applying,
  } = useMutation<unknown, Error>({
    mutationFn: async () => {
      const res = await fetch("/api/settings/update/apply", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) {
        throw new Error(apiErrorMessage(data, "Failed to apply update", res.status));
      }
      return data;
    },
    onSuccess: () => {
      setApplyError("");
      setApplied(true);
    },
    onError: (error) => {
      setApplyError(error.message || "Could not apply the update");
    },
  });

  // Clear transient state when the dialog closes so reopening starts fresh.
  useEffect(() => {
    if (open) return;
    autoCheckedRef.current = false;
    resetCheck();
    setShowReauth(false);
    setApplied(false);
    setApplyError("");
  }, [open, resetCheck]);

  // Check automatically the first time the dialog opens with network available.
  useEffect(() => {
    if (!open || networkLoading || !networkEnabled || autoCheckedRef.current) return;
    autoCheckedRef.current = true;
    runCheck();
  }, [open, networkLoading, networkEnabled, runCheck]);

  const handleCheck = useCallback(() => {
    if (checking || applying || applied) return;
    if (!networkEnabled) return;
    if (isRateLimited("update-check")) return;
    runCheck();
  }, [applied, applying, checking, isRateLimited, networkEnabled, runCheck]);

  const handleUpdate = () => {
    if (applying || applied) return;
    if (isRateLimited("update-apply")) return;
    setApplyError("");
    setShowReauth(true);
  };

  const handleConfirmed = () => {
    setShowReauth(false);
    applyUpdate();
  };

  const hasUpdate = !!checkResult?.hasUpdate;
  const displayLocal = checkResult?.local ?? info?.local ?? null;
  const updating = applying || applied;

  return (
    <>
      <ModalShell
        open={open}
        zIndex={Z_INDEX.SETTINGS_NESTED}
        backdrop="scrim"
        panelClassName="bg-card rounded-3xl shadow-2xl p-6 sm:p-8 w-full max-w-xl border border-border/50 max-h-[90vh] overflow-y-auto"
      >
        <div className="mb-5 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-primary/10 p-2.5 text-primary">
              <DownloadCloud className="h-6 w-6" />
            </div>
            <div className="min-w-0">
              <h2 className="text-3xl font-bold leading-tight">Check for Updates</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Installed build and available updates.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={updating}
            className="p-2 rounded-full hover:bg-muted disabled:opacity-50"
            aria-label="Close update dialog"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        <section aria-label="Current build" className="space-y-2">
          <p className="text-sm font-semibold text-muted-foreground">Current version</p>
          {infoLoading ? (
            <div className="rounded-2xl border border-border/60 bg-secondary/40 p-4">
              <div className="h-4 w-24 animate-pulse rounded bg-muted" />
              <div className="mt-3 h-5 w-3/4 animate-pulse rounded bg-muted" />
              <div className="mt-2 h-4 w-1/2 animate-pulse rounded bg-muted" />
            </div>
          ) : (
            <CommitSummary label="Installed commit" commit={displayLocal} />
          )}
        </section>

        <section aria-label="Update status" className="mt-5">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-muted-foreground">Update status</p>
            <button
              onClick={handleCheck}
              disabled={checking || updating || !networkEnabled || networkLoading}
              className="flex h-11 items-center gap-2 rounded-md bg-secondary px-4 text-sm font-semibold hover:bg-secondary/80 disabled:opacity-50"
              aria-label="Check for updates again"
            >
              <RefreshCw className={`h-4 w-4 ${checking ? "animate-spin" : ""}`} />
              Check again
            </button>
          </div>

          <div className="mt-2" aria-live="polite">
            {!networkEnabled && !networkLoading ? (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-amber-800">
                <WifiOff className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Network is disabled</p>
                  <p className="text-sm">
                    Enable network in Network Settings to check for updates.
                  </p>
                </div>
              </div>
            ) : checking || networkLoading ? (
              <div className="flex items-center gap-3 rounded-2xl border border-border/60 bg-secondary/40 p-4">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                <p className="font-medium">Checking for updates...</p>
              </div>
            ) : checkError ? (
              <div className="flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Could not check for updates</p>
                  <p className="text-sm">{checkError.message}</p>
                </div>
              </div>
            ) : hasUpdate ? (
              <div className="flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-primary">
                <DownloadCloud className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Update available</p>
                  <p className="text-sm text-foreground/80">
                    A newer commit is available on origin/main.
                  </p>
                </div>
              </div>
            ) : checkResult ? (
              <div className="flex items-start gap-3 rounded-2xl border border-green-500/30 bg-green-500/10 p-4 text-green-700">
                <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">You&apos;re up to date</p>
                  <p className="text-sm">
                    This kiosk is running the latest commit on origin/main.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-border/60 bg-secondary/40 p-4 text-muted-foreground">
                Open this dialog while network is enabled to check for updates.
              </div>
            )}
          </div>

          {hasUpdate && checkResult?.remote && (
            <div className="mt-3">
              <CommitSummary label="Available commit" commit={checkResult.remote} tone="primary" />
            </div>
          )}
        </section>

        {applyError && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-destructive">
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
            <div>
              <p className="font-semibold">Update failed</p>
              <p className="text-sm">{applyError}</p>
            </div>
          </div>
        )}

        {updating && (
          <div className="mt-4 flex items-start gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 text-primary">
            <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin" />
            <div>
              <p className="font-semibold">
                {applied ? "Updating system" : "Applying update"}
              </p>
              <p className="text-sm text-foreground/80">
                The Raspberry Pi will reboot shortly. Keep the kiosk powered on.
              </p>
            </div>
          </div>
        )}

        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            disabled={updating}
            className="h-14 flex-1 rounded-xl bg-secondary text-lg font-semibold disabled:opacity-50"
          >
            {updating ? "Please wait" : "Close"}
          </button>
          {hasUpdate ? (
            <button
              onClick={handleUpdate}
              disabled={updating || !networkEnabled}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-lg font-semibold text-primary-foreground disabled:opacity-50"
            >
              {updating ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <DownloadCloud className="h-5 w-5" />
              )}
              {updating ? "Updating..." : "Update & Reboot"}
            </button>
          ) : (
            <button
              onClick={handleCheck}
              disabled={checking || updating || !networkEnabled || networkLoading}
              className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-lg font-semibold text-primary-foreground disabled:opacity-50"
            >
              {checking || networkLoading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <RefreshCw className="h-5 w-5" />
              )}
              Check for Updates
            </button>
          )}
        </div>
      </ModalShell>

      <ReauthPrompt
        open={showReauth}
        title="Apply Update"
        description="Re-enter your password to pull updates from the main branch and reboot the Raspberry Pi."
        confirmLabel="Update & Reboot"
        onClose={() => setShowReauth(false)}
        onConfirmed={handleConfirmed}
      />
    </>
  );
}
