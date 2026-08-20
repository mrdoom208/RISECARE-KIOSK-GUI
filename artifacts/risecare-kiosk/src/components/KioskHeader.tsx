import { Link, useLocation } from "wouter";
import { ArrowLeft, Clock, LogOut, Settings } from "lucide-react";
import { useEffect, useState } from "react";
import { format } from "date-fns";
import { SettingsDialog } from "./settings/SettingsDialog";
import LoginDialog from "@/components/LoginDialog";
import { useRateLimit } from "@/hooks/use-rate-limit";
import { useAdminAuth } from "@/hooks/use-admin-auth";

interface KioskHeaderProps {
  title: string;
  showBack?: boolean;
  backTo?: string;
  onLogout?: () => void;
  wsConnected?: boolean;
}

export function KioskHeader({
  title,
  showBack = false,
  backTo = "/",
  onLogout,
  wsConnected,
}: KioskHeaderProps) {
  const { isRateLimited } = useRateLimit(1000);
  const [time, setTime] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const { account, hasAccess, loggingIn, error: authError, login, logout } =
    useAdminAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      <header className="h-14 sm:h-16 md:h-18 px-3 sm:px-6 bg-card border-b border-border flex items-center justify-between shrink-0 shadow-sm sticky top-0 z-10">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0 w-1/3">
          {onLogout ? (
            <button
              onClick={onLogout}
              className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-secondary text-secondary-foreground shrink-0"
              title="Logout"
            >
              <LogOut className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          ) : showBack ? (
            <button
              onClick={() => setLocation(backTo)}
              className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-secondary text-secondary-foreground shrink-0"
            >
              <ArrowLeft className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          ) : null}
          <div className="flex items-center gap-2.5">
            <span className="font-display font-bold text-base sm:text-lg md:text-xl text-primary tracking-wide whitespace-nowrap">
              RISECARE
            </span>
          </div>
        </div>

        <h1 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-foreground w-1/3 min-w-0 text-center truncate px-2">
          {title}
        </h1>

        <div className="flex items-center justify-end gap-1.5 sm:gap-2 w-1/3 text-muted-foreground">
          {wsConnected !== undefined && (
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${wsConnected ? "bg-green-500" : "bg-red-500"}`}
              title={wsConnected ? "Sensors connected" : "Sensors disconnected"}
            />
          )}
          <span className="hidden sm:flex items-center gap-1.5">
            <Clock className="w-4.5 h-4.5" />
            <span className="text-base md:text-lg font-medium font-sans">
              {format(time, "HH:mm")}
            </span>
          </span>
          <button
            onClick={() => {
              if (isRateLimited("settings")) return;
              if (hasAccess) setShowSettings(true);
              else setShowLogin(true);
            }}
            className="flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-full bg-secondary text-secondary-foreground shrink-0"
            title="Settings"
          >
            <Settings className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </header>

      <LoginDialog
        open={showLogin}
        onOpenChange={setShowLogin}
        error={authError}
        verifying={loggingIn}
        onSubmit={async (username, password) => {
          const ok = await login(username, password, "settings");
          if (ok) {
            setShowLogin(false);
            setShowSettings(true);
          }
        }}
      />

       <SettingsDialog
         isOpen={showSettings}
         onClose={() => setShowSettings(false)}
         account={account}
         onLogout={() => {
           void logout();
           setShowSettings(false);
         }}
       />
    </>
  );
}
