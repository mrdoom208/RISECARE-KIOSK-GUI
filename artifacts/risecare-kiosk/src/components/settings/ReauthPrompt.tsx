import { useState } from "react";
import { Loader2, X } from "lucide-react";

interface ReauthPromptProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirmed: () => void;
}

export function ReauthPrompt({
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

  const close = () => {
    setPassword("");
    setError("");
    onClose();
  };

  const handleConfirm = async () => {
    if (!password || submitting) return;
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
        setError(data.message || data.error || "Password verification failed");
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
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
      <div className="bg-card rounded-3xl shadow-2xl p-8 w-full max-w-md border border-border/50">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-3xl font-bold">{title}</h2>
          <button onClick={close} className="p-2 rounded-full hover:bg-muted" aria-label="Close">
            <X className="w-6 h-6" />
          </button>
        </div>
        <p className="text-center text-muted-foreground mb-6">{description}</p>
        <input
          type="password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") handleConfirm();
          }}
          placeholder="Enter your password"
          className="w-full h-14 px-5 text-xl rounded-xl bg-background border-2 border-border outline-none"
          autoFocus
        />
        {error && <p className="text-red-500 text-sm text-center mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button
            onClick={handleConfirm}
            disabled={!password || submitting}
            className="flex-1 h-14 rounded-xl bg-primary text-primary-foreground text-lg font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {submitting && <Loader2 className="w-6 h-6 animate-spin" />}
            {submitting ? "Verifying..." : confirmLabel}
          </button>
          <button onClick={close} className="flex-1 h-14 rounded-xl bg-secondary text-lg font-semibold">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
