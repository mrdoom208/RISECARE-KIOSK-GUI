import { Link, useLocation } from "wouter";
import { ArrowLeft, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { format } from "date-fns";

interface KioskHeaderProps {
  title: string;
  showBack?: boolean;
  backTo?: string;
}

export function KioskHeader({ title, showBack = false, backTo = "/" }: KioskHeaderProps) {
  const [time, setTime] = useState(new Date());
  const [, setLocation] = useLocation();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="h-24 px-8 bg-card border-b border-border flex items-center justify-between shrink-0 shadow-sm sticky top-0 z-10">
      <div className="flex items-center gap-6 w-1/3">
        {showBack && (
          <button
            onClick={() => setLocation(backTo)}
            className="flex items-center justify-center w-14 h-14 rounded-full bg-secondary text-secondary-foreground active:scale-95 transition-transform"
          >
            <ArrowLeft className="w-8 h-8" />
          </button>
        )}
        <div className="flex items-center gap-3">
          <img 
            src={`${import.meta.env.BASE_URL}images/risecare-logo.png`} 
            alt="RISECARE" 
            className="w-10 h-10 object-contain"
          />
          <span className="font-display font-bold text-2xl text-primary tracking-wide">
            RISECARE
          </span>
        </div>
      </div>
      
      <h1 className="text-3xl font-bold text-foreground w-1/3 text-center truncate">
        {title}
      </h1>
      
      <div className="flex items-center justify-end gap-3 w-1/3 text-muted-foreground">
        <Clock className="w-6 h-6" />
        <span className="text-xl font-medium font-sans">
          {format(time, "HH:mm")}
        </span>
      </div>
    </header>
  );
}
