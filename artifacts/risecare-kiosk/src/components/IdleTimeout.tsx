import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

const DEFAULT_IDLE_TIMEOUT_MS = 120_000;

const ACTIVITY_EVENTS = [
  "pointerdown",
  "touchstart",
  "keydown",
  "wheel",
] as const;

export default function IdleTimeout() {
  const [, setLocation] = useLocation();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const timeoutMsRef = useRef(DEFAULT_IDLE_TIMEOUT_MS);
  const [loaded, setLoaded] = useState(false);

  const resetTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
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
