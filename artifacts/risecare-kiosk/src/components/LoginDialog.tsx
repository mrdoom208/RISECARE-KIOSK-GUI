import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Loader2, Eye, EyeOff } from "lucide-react";

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
  description = "Enter your admin credentials",
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

  const submit = () => {
    if (!username.trim() || !password || verifying) return;
    onSubmit(username.trim(), password);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-md rounded-3xl p-8"
        style={{ top: "calc(50% - var(--vk-height, 0px) / 2)" }}
      >
        <h2 className="text-3xl font-bold text-center mb-2">{title}</h2>
        <p className="text-center text-muted-foreground mb-4">{description}</p>

        <div className="space-y-3">
          {error && (
            <p className="text-red-500 text-center text-sm">{error}</p>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">Username</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              placeholder="Enter username"
              className="w-full h-14 px-5 text-xl rounded-xl bg-background border-2 border-border outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-semibold text-foreground">Password</label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                placeholder="Enter password"
                className="w-full h-14 px-5 pr-16 text-xl rounded-xl bg-background border-2 border-border outline-none"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-lg text-muted-foreground hover:text-foreground"
                aria-label={showPassword ? "Hide password" : "Show password"}
              >
                {showPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
              </button>
            </div>
          </div>

          <button
            onClick={submit}
            disabled={!username.trim() || !password || verifying}
            className="w-full h-16 rounded-2xl bg-primary text-primary-foreground text-2xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50 transition-transform active:scale-95"
          >
            {verifying ? (
              <Loader2 className="w-7 h-7 animate-spin" />
            ) : (
              "Enter"
            )}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
