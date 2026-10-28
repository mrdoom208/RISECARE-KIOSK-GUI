import { useEffect, useRef, useState, type ReactNode } from "react";
import { RotateCcw } from "lucide-react";

interface SwipeReloadProps {
  children: ReactNode;
  threshold?: number;
}

export function SwipeReload({ children, threshold = 80 }: SwipeReloadProps) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isPulling, setIsPulling] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startYRef = useRef(0);
  const currentYRef = useRef(0);

  useEffect(() => {
    if (isRefreshing) {
      setTimeout(() => {
        window.location.reload();
      }, 500);
    }
  }, [isRefreshing]);

  const handleTouchStart = (e: TouchEvent) => {
    if (window.scrollY > 5) return;
    startYRef.current = e.touches[0].clientY;
    setIsPulling(true);
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (!isPulling || isRefreshing) return;
    if (window.scrollY > 5) {
      setIsPulling(false);
      setPullDistance(0);
      return;
    }
    currentYRef.current = e.touches[0].clientY;
    const diff = currentYRef.current - startYRef.current;
    if (diff > 0) {
      e.preventDefault();
      setPullDistance(Math.min(diff * 0.5, threshold * 1.5));
    }
  };

  const handleTouchEnd = () => {
    if (!isPulling) return;
    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      setPullDistance(threshold);
    } else {
      setPullDistance(0);
    }
    setIsPulling(false);
  };

  useEffect(() => {
    document.addEventListener("touchstart", handleTouchStart, { passive: true });
    document.addEventListener("touchmove", handleTouchMove, { passive: false });
    document.addEventListener("touchend", handleTouchEnd);
    return () => {
      document.removeEventListener("touchstart", handleTouchStart);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleTouchEnd);
    };
  });

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
