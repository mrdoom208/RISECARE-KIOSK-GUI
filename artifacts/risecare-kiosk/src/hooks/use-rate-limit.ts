import { useRef, useCallback } from "react";

export function useRateLimit(delay = 1000) {
  const lastAction = useRef<Record<string, number>>({});

  const isRateLimited = useCallback(
    (key = "default"): boolean => {
      const now = Date.now();
      const last = lastAction.current[key];
      if (last != null && now - last < delay) return true;
      lastAction.current[key] = now;
      return false;
    },
    [delay],
  );

  const resetRateLimit = useCallback((key = "default") => {
    delete lastAction.current[key];
  }, []);

  return { isRateLimited, resetRateLimit };
}
