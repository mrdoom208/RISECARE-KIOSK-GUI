import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { apiErrorMessage } from "@/lib/api-error";

export function LockScreen() {
  const [, setLocation] = useLocation();
  const { login, loggingIn, error, logout } = useAdminAuth();
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);

  useEffect(() => {
    const checkLock = () => {
      const isLocked = localStorage.getItem("risecare-kiosk-locked") === "true";
      setLocked(isLocked);
    };
    checkLock();
    window.addEventListener("storage", checkLock);
    window.addEventListener("risecare-lockscreen", checkLock);
    return () => {
      window.removeEventListener("storage", checkLock);
      window.removeEventListener("risecare-lockscreen", checkLock);
    };
  }, []);

  useEffect(() => {
    if (locked) {
      const accounts = JSON.parse(localStorage.getItem("risecare-locked-accounts") || "[]");
      if (Array.isArray(accounts) && accounts.length > 0) {
        setUsername(accounts[0].username);
      }
    }
  }, [locked]);

  const handleUnlock = async () => {
    setLocalError(null);
    if (!username || !password) {
      setLocalError("Password required");
      return;
    }
    const ok = await login(username, password, "settings");
    if (ok) {
      localStorage.removeItem("risecare-kiosk-locked");
      localStorage.removeItem("risecare-locked-accounts");
      setLocked(false);
      setPassword("");
      window.dispatchEvent(new Event("risecare-lockscreen"));
      window.dispatchEvent(new Event("risecare-admin-session"));
    } else {
      setLocalError(error || "Invalid password");
    }
  };

  if (!locked) return null;

  return (
    <div className="fixed inset-0 z-[9999] bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-4">
            <Lock className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-4xl font-bold mb-2">Kiosk Locked</h1>
          <p className="text-muted-foreground text-center">
            Enter admin password to unlock
          </p>
        </div>

        <div className="bg-card rounded-3xl p-8 shadow-xl border border-border">
          {(localError || error) && (
            <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm text-center">
              {localError || error}
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Username</label>
              <input
                type="text"
                value={username || ""}
                disabled
                className="w-full h-14 px-5 text-xl rounded-md bg-muted border-2 border-border"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-semibold">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUnlock();
                  }}
                  placeholder="Enter password"
                  className="w-full h-14 px-5 pr-16 text-xl rounded-md bg-background border-2 border-border outline-none focus:border-primary"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                >
                  {showPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleUnlock}
              disabled={!password || loggingIn}
              className="w-full h-14 rounded-md bg-primary text-primary-foreground text-xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loggingIn ? <Loader2 className="w-6 h-6 animate-spin" /> : null}
              Unlock
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
