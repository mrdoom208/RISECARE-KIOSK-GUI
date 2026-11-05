import { useEffect, useState } from "react";
import { Lock, Eye, EyeOff, Loader2 } from "lucide-react";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import { Z_INDEX } from "@/lib/z-index";

export function LockScreen() {
  const { account, login, loggingIn, error } = useAdminAuth();
  const [locked, setLocked] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<{ username: string }[]>([]);

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
    if (!locked) return;

    const cachedRaw = localStorage.getItem("risecare-locked-accounts");
    if (cachedRaw) {
      try {
        const cached = JSON.parse(cachedRaw);
        if (Array.isArray(cached) && cached.length > 0) {
          setAccounts(cached);
          setUsername((current) => current ?? cached[0].username);
        }
      } catch {
        // Ignore corrupt cached account data and fall back to the server.
      }
    }

    let active = true;
    fetch("/api/settings/accounts")
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((list) => {
        if (!active || !Array.isArray(list) || list.length === 0) return;
        localStorage.setItem("risecare-locked-accounts", JSON.stringify(list));
        setAccounts(list);
        setUsername((current) => current ?? list[0].username);
      })
      .catch(() => {
        // Cached usernames, if any, are already available above.
      });

    return () => {
      active = false;
    };
  }, [locked]);

  useEffect(() => {
    if (locked && username === null && account?.username) {
      setUsername(account.username);
    }
  }, [account?.username, locked, username]);

  const handleUnlock = async () => {
    setLocalError(null);
    const trimmedUsername = (username ?? "").trim();
    if (!trimmedUsername || !password) {
      setLocalError(
        !trimmedUsername ? "Username required" : "Password required",
      );
      return;
    }
    const ok = await login(trimmedUsername, password, "settings");
    if (ok) {
      localStorage.removeItem("risecare-kiosk-locked");
      localStorage.removeItem("risecare-locked-accounts");
      setLocked(false);
      setPassword("");
      window.dispatchEvent(new Event("risecare-lockscreen"));
      window.dispatchEvent(new Event("risecare-admin-session"));
    } else {
      setLocalError(error || "Invalid username or password");
      setPassword("");
    }
  };

  if (!locked) return null;

  return (
    <div
      className="fixed inset-0 bg-background flex items-center justify-center p-4"
      style={{ zIndex: Z_INDEX.LOCK_SCREEN }}
    >
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="h-20 w-20 rounded-3xl bg-primary/10 flex items-center justify-center mb-4">
            <Lock className="h-10 w-10 text-primary" />
          </div>
          <h1 className="text-4xl font-bold mb-2">Kiosk Locked</h1>
          <p className="text-muted-foreground text-center">
            Enter your admin username and password to unlock
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
              <label htmlFor="lock-username" className="text-sm font-semibold">
                Username
              </label>
              <input
                id="lock-username"
                type="text"
                list={accounts.length > 0 ? "lock-usernames" : undefined}
                value={username ?? ""}
                onChange={(event) => {
                  setUsername(event.target.value);
                  setLocalError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleUnlock();
                }}
                placeholder="Enter admin username"
                autoComplete="username"
                autoFocus={!username}
                className="w-full h-14 px-5 text-xl rounded-md bg-background border-2 border-border outline-none focus:border-primary"
              />
              {accounts.length > 0 && (
                <datalist id="lock-usernames">
                  {accounts.map((item) => (
                    <option key={item.username} value={item.username} />
                  ))}
                </datalist>
              )}
            </div>

            <div className="space-y-1.5">
              <label htmlFor="lock-password" className="text-sm font-semibold">
                Password
              </label>
              <div className="relative">
                <input
                  id="lock-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleUnlock();
                  }}
                  placeholder="Enter password"
                  autoComplete="current-password"
                  autoFocus={Boolean(username)}
                  className="w-full h-14 px-5 pr-16 text-xl rounded-md bg-background border-2 border-border outline-none focus:border-primary"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 h-11 w-11 flex items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? <EyeOff className="w-6 h-6" /> : <Eye className="w-6 h-6" />}
                </button>
              </div>
            </div>

            <button
              onClick={handleUnlock}
              disabled={!username?.trim() || !password || loggingIn}
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
