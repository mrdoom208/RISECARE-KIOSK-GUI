import { useLocation } from "wouter";
import { useState } from "react";
import { Activity, ArrowRight, ClipboardList, Lock, Search, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useRateLimit } from "@/hooks/use-rate-limit";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import LoginDialog from "@/components/LoginDialog";
import TermsAgreementDialog from "@/components/TermsAgreementDialog";

export default function Home() {
  const { isRateLimited } = useRateLimit(1000);
  const [, setLocation] = useLocation();
  const [showTerms, setShowTerms] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const { hasAccess, loggingIn, error: authError, login } = useAdminAuth();

  const { data: sessions, isLoading } = useQuery<any[]>({
    queryKey: ["home-history-sessions"],
    queryFn: async () => {
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error("Failed to load history");
      return res.json();
    },
    enabled: hasAccess,
  });

  return (
    <div className="h-dvh bg-background flex flex-col relative overflow-hidden">
      {/* Background Image Layer */}
      <div className="absolute inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/kiosk-bg.png`}
          alt="Background"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background"></div>
      </div>

      <div className="relative z-10 flex-1 flex min-h-0 overflow-y-auto">
        <div className="m-auto w-full max-w-7xl flex flex-col items-center justify-center p-4 py-8">
        <div className="text-center mb-6 sm:mb-8"
        >
          <div className="w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 bg-white rounded-3xl shadow-xl p-3 sm:p-4 mx-auto mb-5 flex items-center justify-center border border-border/50">
            <img
              src={`${import.meta.env.BASE_URL}images/risecare-logo.png`}
              alt="RISECARE Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-extrabold text-foreground mb-2 tracking-tight">
            Welcome to RISECARE
          </h1>
          <p className="text-xl md:text-xl text-muted-foreground font-medium max-w-3xl mx-auto leading-relaxed">
            Your comprehensive vital signs monitoring kiosk. Quick, accurate,
            and easy to use.
          </p>
        </div>

        <div className="flex flex-col portrait:flex-col md:flex-row gap-3 w-full max-w-2xl"
        >
          <div className="flex-1">
            <button
              onClick={() => {
                if (isRateLimited("start-measurement")) return;
                setShowTerms(true);
              }}
              className="w-full bg-primary hover:bg-primary/90 text-primary-foreground p-5 rounded-[1rem] shadow-xl shadow-primary/25 flex flex-col items-center justify-center gap-2 border border-white/10 group"
            >
              <div className="bg-white/20 p-3 rounded-full">
                <UserPlus className="w-8 h-8 text-white" />
              </div>
              <span className="text-2xl font-bold font-display">
                Start Measurement
              </span>
            </button>
          </div>

          <div className="flex-1">
            <button
              onClick={() => {
                if (isRateLimited("view-history")) return;
                setShowLogin(true);
              }}
              className="w-full bg-card hover:bg-secondary text-foreground p-5 rounded-[1rem] shadow-xl shadow-black/5 flex flex-col items-center justify-center gap-2 border border-border"
            >
              <div className="bg-primary/10 p-3 rounded-full text-primary">
                <ClipboardList className="w-8 h-8" />
              </div>
              <span className="text-2xl font-bold font-display">
                View History
              </span>
            </button>
          </div>
        </div>

        <button
          onClick={() => {
            if (isRateLimited("find-session")) return;
            setLocation("/find-session");
          }}
          className="mt-3 w-full max-w-2xl bg-card hover:bg-secondary text-foreground p-4 rounded-[1rem] shadow-xl shadow-black/5 flex items-center justify-center gap-3 border border-border"
        >
          <div className="bg-primary/10 p-2.5 rounded-full text-primary shrink-0">
            <Search className="w-6 h-6" />
          </div>
          <div className="text-left">
            <span className="block text-2xl font-bold font-display">
              Find my Session
            </span>
            <span className="block text-sm text-muted-foreground font-medium">
              Look up your results using your phone number or reference
            </span>
          </div>
          <ArrowRight className="w-6 h-6 text-primary shrink-0 ml-auto" />
        </button>

        {/* Recent Sessions widget */}
        <div className="mt-8 w-full max-w-2xl"
        >
          <div className="flex items-center justify-between mb-3 px-2">
            <h3 className="text-xl font-bold text-foreground">
              Recent Sessions
            </h3>
            <button
              type="button"
              onClick={() => {
                if (isRateLimited("view-all-history")) return;
                setShowLogin(true);
              }}
              className="text-primary text-lg font-semibold flex items-center gap-1"
            >
              View All <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-card border border-border/50 rounded-2xl shadow-lg overflow-hidden backdrop-blur-md bg-white/80">
            {!hasAccess ? (
              <div className="p-6 text-center">
                <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Lock className="h-6 w-6" />
                </div>
                <p className="text-xl font-semibold text-foreground">
                  Patient records are protected
                </p>
                <p className="text-base text-muted-foreground mt-1">
                  Sign in as an administrator to view patient history.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    if (isRateLimited("view-history-locked")) return;
                    setShowLogin(true);
                  }}
                  className="mt-4 inline-flex items-center gap-2 text-primary text-lg font-semibold"
                >
                  View History <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            ) : isLoading ? (
              <div className="p-6 text-center text-lg text-muted-foreground">
                Loading history...
              </div>
            ) : Array.isArray(sessions) && sessions.length > 0 ? (
              <div className="divide-y divide-border/50">
                {sessions.slice(0, 3).map((session) => (
                  <div
                    key={session.id}
                    className="w-full text-left"
                  >
                    <div className="p-3 flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                          <Activity className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xl font-bold text-foreground">
                            {session.patientName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(
                              new Date(session.startedAt),
                              "MMM d, yyyy • h:mm a",
                            )}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xl text-muted-foreground font-medium">
                No past sessions found.
              </div>
            )}
          </div>
        </div>
        </div>
      </div>

      <LoginDialog
        open={showLogin}
        onOpenChange={setShowLogin}
        title="Admin Login"
        description="Enter your admin credentials to view session history."
        error={authError}
        verifying={loggingIn}
        onSubmit={async (username, password) => {
          const ok = await login(username, password, "history");
          if (ok) {
            setShowLogin(false);
            setLocation("/history");
          }
        }}
      />

      <TermsAgreementDialog
        open={showTerms}
        onOpenChange={setShowTerms}
        onAgree={() => setLocation("/register")}
      />
    </div>
  );
}
