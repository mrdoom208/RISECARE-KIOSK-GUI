import { useCallback, useEffect, useState } from "react";
import type { SettingsAccount } from "@/components/LoginDialog";

export const ADMIN_SESSION_EVENT = "risecare-admin-session";

// Centralized admin authentication. The server is the source of truth:
// login() performs POST /api/settings/login and stores an HttpOnly session,
// logout() clears it, and /api/settings/me confirms it on mount and whenever
// ADMIN_SESSION_EVENT fires, keeping every hook instance in sync.
export function useAdminAuth() {
  const [account, setAccount] = useState<SettingsAccount | null>(null);
  const [checking, setChecking] = useState(true);
  const [loggingIn, setLoggingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/settings/me");
      if (!res.ok) {
        setAccount(null);
        return;
      }
      const data = await res.json();
      setAccount(data);
    } catch {
      setAccount(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      void refresh();
    };
    window.addEventListener(ADMIN_SESSION_EVENT, handler);
    void refresh();
    return () => {
      window.removeEventListener(ADMIN_SESSION_EVENT, handler);
    };
  }, [refresh]);

  const login = useCallback(
    async (
      username: string,
      password: string,
      context?: "history" | "settings",
    ) => {
      setError(null);
      setLoggingIn(true);
      try {
        const res = await fetch("/api/settings/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            username: username.trim(),
            password,
            ...(context ? { context } : {}),
          }),
        });

        const data = await res.json();

        if (data.success) {
          setAccount(data.account);
          window.dispatchEvent(new Event(ADMIN_SESSION_EVENT));
          return true;
        }

        setError(data.error || "Invalid username or password");
        return false;
      } catch {
        setError("Failed to login");
        return false;
      } finally {
        setLoggingIn(false);
      }
    },
    [],
  );

  const logout = useCallback(async () => {
    try {
      await fetch("/api/settings/logout", { method: "POST" });
    } catch {
      // Ignore network errors; still clear the local state.
    }
    setAccount(null);
    setError(null);
    window.dispatchEvent(new Event(ADMIN_SESSION_EVENT));
  }, []);

  return {
    account,
    hasAccess: account != null,
    checking,
    loggingIn,
    error,
    login,
    logout,
  };
}
