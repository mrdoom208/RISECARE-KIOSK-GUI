import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { useHistoryState } from "wouter/use-browser-location";
import { useAdminAuth } from "@/hooks/use-admin-auth";

const DEFAULT_IDLE_TIMEOUT_MS = 120_000;

const ACTIVITY_EVENTS = [
  "pointerdown",
  "touchstart",
  "keydown",
  "wheel",
] as const;

export default function IdleTimeout() {
  const [, setLocation] = useLocation();
  const { hasAccess, logout } = useAdminAuth();
  const historyState = useHistoryState<{ token?: string }>();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutMsRef = useRef(DEFAULT_IDLE_TIMEOUT_MS);
  // Keep the latest auth state and active session token reachable from the
  // timer without re-arming it on every render.
  const hasAccessRef = useRef(hasAccess);
  const logoutRef = useRef(logout);
  const sessionTokenRef = useRef<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  hasAccessRef.current = hasAccess;
  logoutRef.current = logout;
  sessionTokenRef.current = historyState?.token ?? null;

  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      // A session left open on the dashboard is finished when the kiosk idles
      // out, otherwise it would stay local and never sync.
      const token = sessionTokenRef.current;
      if (token) {
        void fetch("/api/sessions/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        }).catch(() => {
          // Best effort: the next idle/finish attempt can still complete it.
        });
      }
      // End any admin session, then return to the home screen.
      if (hasAccessRef.current) {
        void logoutRef.current();
      }
      setLocation("/");
    }, timeoutMsRef.current);
  };

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/settings/idle-timeout", { signal: controller.signal })
      .then((r) => r.json())
      .then((data) => {
        const seconds = Number(data?.seconds);
        if (Number.isFinite(seconds) && seconds > 0) {
          timeoutMsRef.current = seconds * 1000;
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    resetTimer();
    const onActivity = () => resetTimer();
    ACTIVITY_EVENTS.forEach((event) =>
      window.addEventListener(event, onActivity, { passive: true }),
    );
    return () => {
      ACTIVITY_EVENTS.forEach((event) =>
        window.removeEventListener(event, onActivity),
      );
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [loaded]);

  return null;
}
