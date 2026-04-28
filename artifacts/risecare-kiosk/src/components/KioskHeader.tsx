import { Link, useLocation } from "wouter";
import { ArrowLeft, Clock, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { SettingsDialog } from "./SettingsDialog";

interface KioskHeaderProps {
  title: string;
  showBack?: boolean;
  backTo?: string;
}

export function KioskHeader({
  title,
  showBack = false,
  backTo = "/",
}: KioskHeaderProps) {
  const [time, setTime] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [, setLocation] = useLocation();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <header className="h-18 px-6 bg-card border-b border-border flex items-center justify-between shrink-0 shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-4 w-1/3">
          {showBack && (
            <button
              onClick={() => setLocation(backTo)}
              className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary text-secondary-foreground active:scale-95 transition-transform"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
          )}
          <div className="flex items-center gap-2.5">
            <span className="font-display font-bold text-xl text-primary tracking-wide">
              RISECARE
            </span>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-foreground w-1/3 text-center truncate">
          {title}
        </h1>

        <div className="flex items-center justify-end gap-2.25 w-1/3 text-muted-foreground">
          <Clock className="w-4.5 h-4.5" />
          <span className="text-lg font-medium font-sans">
            {format(time, "HH:mm")}
          </span>
          <button
            onClick={() => setShowSettings(true)}
            className="flex items-center justify-center w-10 h-10 rounded-full bg-secondary text-secondary-foreground active:scale-95 transition-transform ml-2"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      <SettingsDialog
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
      />
    </>
  );
}
