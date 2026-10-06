import { memo, useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { ModalShell } from "@/components/ModalShell";
import { apiErrorMessage } from "@/lib/api-error";

interface ReauthPromptProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirmed: () => void;
}

// express-rate-limit always sends `Retry-After` as a whole number of seconds on a
// 429. Fall back to the limiter's window (15 min) if the header is ever absent.
const FALLBACK_LOCKOUT_SECONDS = 15 * 60;

function retryAfterSeconds(res: Response): number {
  const seconds = Number(res.headers.get("Retry-After"));
  return Number.isFinite(seconds) && seconds > 0 ? seconds : FALLBACK_LOCKOUT_SECONDS;
}

// Owns its own 1 Hz interval so the tick re-renders only this text node, never
// the password field or the buttons sitting above the blurred settings layer.
const RetryCountdown = memo(function RetryCountdown({
  retryAt,
  onElapsed,
}: {
  retryAt: number;
  onElapsed: () => void;
}) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, Math.ceil((retryAt - Date.now()) / 1000)),
  );

  useEffect(() => {
    const tick = () => {
      const next = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
      setRemaining(next);
      if (next === 0) onElapsed();
    };
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [retryAt, onElapsed]);

  const minutes = Math.floor(remaining / 60);
  const seconds = remaining % 60;

  return (
    <p role="status" aria-live="polite" className="text-sm text-center mt-1 tabular-nums">
      Try again in {minutes}:{String(seconds).padStart(2, "0")}
    </p>
  );
});

const Header = memo(function Header({
  title,
  onClose,
}: {
  title: string;
  onClose: () => void;
}) {
  return (
    <div className="flex justify-between items-center mb-6">
      <h2 className="text-3xl font-bold">{title}</h2>
      <button onClick={onClose} className="p-2 rounded-full hover:bg-muted" aria-label="Close">
        <X className="w-6 h-6" />
      </button>
    </div>
  );
});

const PasswordField = memo(function PasswordField({
  value,
  disabled,
  onChange,
  onSubmit,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <input
      type="password"
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSubmit();
      }}
      placeholder="Enter your password"
      className="w-full h-14 px-5 text-xl rounded-xl bg-background border-2 border-border outline-none"
      autoFocus
    />
  );
});

const Actions = memo(function Actions({
  disabled,
  submitting,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  disabled: boolean;
  submitting: boolean;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="flex gap-2 mt-4">
      <button
        onClick={onConfirm}
        disabled={disabled}
        className="flex-1 h-14 rounded-xl bg-primary text-primary-foreground text-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {submitting && <Loader2 className="w-6 h-6 animate-spin" />}
        {submitting ? "Verifying..." : confirmLabel}
      </button>
      <button onClick={onCancel} className="flex-1 h-14 rounded-xl bg-secondary text-lg font-semibold">
        Cancel
      </button>
    </div>
  );
});

export const ReauthPrompt = memo(function ReauthPrompt({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  onClose,
  onConfirmed,
}: ReauthPromptProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [retryAt, setRetryAt] = useState<number | null>(null);

  // The prompt is always stacked above another modal, so it contributes a scrim
  // rather than a second frosted layer. Rendered through a portal it is a body
  // sibling of that modal, which keeps the `animate-spin` below off any
  // `backdrop-filter` ancestor and lets the compositor cache the blur.
  const close = useCallback(() => {
    setPassword("");
    setError("");
    setRetryAt(null);
    onClose();
  }, [onClose]);

  const endLockout = useCallback(() => {
    setRetryAt(null);
    setError("");
  }, []);

  const handlePasswordChange = useCallback((value: string) => {
    setPassword(value);
    setError((prev) => (prev ? "" : prev));
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!password || submitting || retryAt !== null) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/settings/reauthenticate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        if (res.status === 429) {
          setError("Too many failed attempts.");
          setRetryAt(Date.now() + retryAfterSeconds(res) * 1000);
        } else {
          setError(apiErrorMessage(data, "Password verification failed", res.status));
        }
        return;
      }
      setPassword("");
      onClose();
      onConfirmed();
    } catch {
      setError("Password verification failed");
    } finally {
      setSubmitting(false);
    }
  }, [onClose, onConfirmed, password, retryAt, submitting]);

  return (
    <ModalShell
      open={open}
      zIndex={70}
      backdrop="scrim"
      panelClassName="bg-card rounded-3xl shadow-2xl p-8 w-full max-w-md border border-border/50"
    >
      <Header title={title} onClose={close} />
      <p className="text-center text-muted-foreground mb-6">{description}</p>
      <PasswordField
        value={password}
        disabled={submitting || retryAt !== null}
        onChange={handlePasswordChange}
        onSubmit={handleConfirm}
      />
      {error && <p className="text-red-500 text-sm text-center mt-2">{error}</p>}
      {retryAt !== null && <RetryCountdown retryAt={retryAt} onElapsed={endLockout} />}
      <Actions
        disabled={!password || submitting || retryAt !== null}
        submitting={submitting}
        confirmLabel={confirmLabel}
        onConfirm={handleConfirm}
        onCancel={close}
      />
    </ModalShell>
  );
});
