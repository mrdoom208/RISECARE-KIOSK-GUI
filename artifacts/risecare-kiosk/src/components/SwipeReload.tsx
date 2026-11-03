import { useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

interface SwipeReloadProps {
  children: ReactNode;
  threshold?: number;
}

// Pull-to-refresh must only own gestures that start on a page that cannot
// scroll. Inside a dialog or a scrollable panel the browser has to keep the
// gesture so touch swiping scrolls the content instead of being cancelled.
function findScrollableAncestor(target: EventTarget | null): Element | null {
  let node = target instanceof Element ? target : null;
  while (node && node !== document.body) {
    const style = getComputedStyle(node);
    const scrollsY = /(auto|scroll|overlay)/.test(style.overflowY);
    if (scrollsY && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
}

export function SwipeReload({ children, threshold = 80 }: SwipeReloadProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const startXRef = useRef(0);
  const pullDistanceRef = useRef(0);
  const isPullingRef = useRef(false);
  const isRefreshingRef = useRef(false);
  const axisRef = useRef<"unknown" | "vertical" | "horizontal">("unknown");

  useEffect(() => {
    if (!isRefreshing) return;
    const timer = setTimeout(() => {
      window.location.reload();
    }, 500);
    return () => clearTimeout(timer);
  }, [isRefreshing]);

  useEffect(() => {
    const setPull = (value: number) => {
      pullDistanceRef.current = value;
      setPullDistance(value);
    };

    const cancelPull = () => {
      isPullingRef.current = false;
      axisRef.current = "unknown";
      setIsPulling(false);
      setPull(0);
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      if (isRefreshingRef.current) return;
      if (window.scrollY > 5) return;
      // Dialogs and their panels scroll on their own (ModalShell + Radix).
      if (
        document.querySelector(
          '[data-modal-shell], [role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]',
        )
      ) {
        return;
      }
      // Any scrollable element under the finger keeps the gesture.
      if (findScrollableAncestor(e.target)) return;

      startYRef.current = e.touches[0].clientY;
      startXRef.current = e.touches[0].clientX;
      axisRef.current = "unknown";
      isPullingRef.current = true;
      setIsPulling(true);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || isRefreshingRef.current) return;
      if (window.scrollY > 5) {
        cancelPull();
        return;
      }

      const touch = e.touches[0];
      const diffY = touch.clientY - startYRef.current;
      const diffX = touch.clientX - startXRef.current;

      // Wait until the gesture has a clear direction, then only hijack
      // vertical downward drags. Horizontal panning and upward scrolling are
      // always left to the browser (tables, carousels, long lists).
      if (axisRef.current === "unknown") {
        if (Math.abs(diffX) < 8 && Math.abs(diffY) < 8) return;
        axisRef.current =
          Math.abs(diffX) > Math.abs(diffY) ? "horizontal" : "vertical";
        if (axisRef.current === "horizontal" || diffY <= 0) {
          cancelPull();
          return;
        }
      }

      if (axisRef.current !== "vertical" || diffY <= 0) return;
      if (e.cancelable) e.preventDefault();
      setPull(Math.min(diffY * 0.5, threshold * 1.5));
    };

    const handleTouchEnd = () => {
      if (!isPullingRef.current) return;
      if (pullDistanceRef.current >= threshold && !isRefreshingRef.current) {
        isRefreshingRef.current = true;
        setIsRefreshing(true);
        setPull(threshold);
      } else {
        setPull(0);
      }
      isPullingRef.current = false;
      axisRef.current = "unknown";
      setIsPulling(false);
    };

    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
    document.addEventListener("touchcancel", handleTouchEnd);
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
      document.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [threshold]);

  return (
    <div className="relative min-h-screen">
      <div
        className="absolute top-0 left-0 right-0 flex items-center justify-center transition-all overflow-hidden"
        style={{
          height: pullDistance,
          opacity: pullDistance / threshold,
        }}
      >
        <div className="flex items-center gap-2 text-primary">
          <RotateCcw className={`w-6 h-6 ${isRefreshing ? "animate-spin" : ""}`} />
          <span className="font-semibold">
            {isRefreshing ? "Reloading..." : pullDistance >= threshold ? "Release to reload" : "Pull to reload"}
          </span>
        </div>
      </div>
      <div
        style={{
          transform: `translateY(${pullDistance}px)`,
          transition: isPulling ? "none" : "transform 0.3s ease-out",
        }}
      >
        {children}
      </div>
    </div>
  );
}
