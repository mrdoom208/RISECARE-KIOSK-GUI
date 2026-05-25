import { useEffect, useState } from "react";
import { useLocation } from "wouter";
export default function NotFound() {
  const [countdown, setCountdown] = useState(5);
  const [, setLocation] = useLocation();

  useEffect(() => {
    // Countdown timer
    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    // Redirect when countdown reaches 0
    if (countdown <= 0) {
      setLocation("/");
    }

    return () => clearInterval(timer);
  }, [countdown]);
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background">
      {/* Circular Loader */}
      <div className="w-24 h-24 border-4 border-primary border-t-transparent rounded-full mb-8"></div>

      <div className="text-center">
        <h1 className="text-3xl md:text-5xl font-bold text-destructive mb-4">
          Page not found
        </h1>
        <p className="text-xl text-muted-foreground">
          Redirecting to home in {countdown} second
          {countdown !== 1 ? "s" : ""}...
        </p>
      </div>
    </div>
  );
}
