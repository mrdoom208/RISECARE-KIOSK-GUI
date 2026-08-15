import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { AlertCircle, Eye, EyeOff, Loader2, LogIn, ShieldCheck } from "lucide-react";

export interface SettingsAccount {
  id: number;
  username: string;
  role: "admin" | "superadmin";
  created_at: string;
}

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  error?: string | null;
  verifying?: boolean;
  onSubmit: (username: string, password: string) => void;
}

export default function LoginDialog({
  open,
  onOpenChange,
  title = "Admin Login",
  description = "Sign in to manage this device",
  error,
  verifying = false,
  onSubmit,
}: LoginDialogProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (open) {
      setUsername("");
      setPassword("");
      setShowPassword(false);
    }
  }, [open]);

  const handleSubmit = () => {
    if (!username.trim() || !password || verifying) return;
    onSubmit(username, password);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md rounded-3xl p-8"
        style={{ top: "calc(50% - var(--vk-height, 0px) / 2)" }}
      >
        <div className="flex flex-col items-center mb-6">
          <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <h2 className="mt-4 text-3xl font-bold">{title}</h2>
          <p className="mt-1 text-muted-foreground">{description}</p>
        </div>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-md bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <div className="space-y-4 w-full max-w-sm mx-auto">
          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSubmit();
              }}
              placeholder="Enter username"
              className="w-full h-14 px-5 text-xl rounded-md bg-background border-2 border-border outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
                placeholder="Enter password"
                className="w-full h-14 px-5 pr-16 text-xl rounded-md bg-background border-2 border-border outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
              </button>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!username.trim() || !password || verifying}
            className="w-full h-14 rounded-md bg-primary text-primary-foreground text-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-all"
          >
            {verifying ? (
              <>
                <Loader2 className="w-6 h-6 animate-spin" />
                Signing in...
              </>
            ) : (
              <>
                <LogIn className="w-6 h-6" />
                Sign in
              </>
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
