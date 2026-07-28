import { Link, useLocation } from "wouter";
import { useState } from "react";
import { Activity, ArrowRight, Check, ClipboardList, Loader2, UserPlus, X } from "lucide-react";
import { format } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { useRateLimit } from "@/hooks/use-rate-limit";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

const HISTORY_ACCESS_KEY = "risecare-history-access";

export default function Home() {
  const { isRateLimited } = useRateLimit(1000);
  const [, setLocation] = useLocation();
  const [showHistoryPasscode, setShowHistoryPasscode] = useState(false);
  const [historyTarget, setHistoryTarget] = useState("/history");
  const [historyPasscode, setHistoryPasscode] = useState("");
  const [historyError, setHistoryError] = useState("");
  const [isVerifyingHistory, setIsVerifyingHistory] = useState(false);
  const [hasHistoryAccess, setHasHistoryAccess] = useState(
    () => sessionStorage.getItem(HISTORY_ACCESS_KEY) === "true",
  );
  const { data: sessions, isLoading } = useQuery<any[]>({
    queryKey: ["home-history-sessions"],
    queryFn: async () => {
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error("Failed to load history");
      return res.json();
    },
  });

  const requestHistoryAccess = (target = "/history") => {
    if (hasHistoryAccess) {
      setLocation(target);
      return;
    }

    setHistoryTarget(target);
    setShowHistoryPasscode(true);
  };

  const closeHistoryPasscode = () => {
    setShowHistoryPasscode(false);
    setHistoryPasscode("");
    setHistoryError("");
    setIsVerifyingHistory(false);
  };

  const handleHistoryKeyPress = (num: string) => {
    if (historyPasscode.length < 6) {
      setHistoryError("");
      setHistoryPasscode((prev) => prev + num);
    }
  };

  const handleHistoryPasswordDelete = () => {
    setHistoryError("");
    setHistoryPasscode((prev) => prev.slice(0, -1));
  };

  const handleHistoryPasswordSubmit = async () => {
    if (historyPasscode.length !== 6 || isVerifyingHistory) return;

    try {
      setIsVerifyingHistory(true);
      const res = await fetch("/api/settings/verify-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode: historyPasscode, context: "history" }),
      });
      const data = await res.json();

      if (data.success) {
        sessionStorage.setItem(HISTORY_ACCESS_KEY, "true");
        setHasHistoryAccess(true);
        closeHistoryPasscode();
        setLocation(historyTarget);
      } else {
        setHistoryError("Incorrect passcode");
        setHistoryPasscode("");
      }
    } catch {
      setHistoryError("Failed to verify passcode");
    } finally {
      setIsVerifyingHistory(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Background Image Layer */}
      <div className="absolute inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/kiosk-bg.png`}
          alt="Background"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background"></div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4 max-w-7xl mx-auto w-full">
        <div className="text-center mb-8"
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

        <div className="flex flex-col md:flex-row gap-3 w-full max-w-2xl"
        >
          <Link
            href="/register"
            className="flex-1"
            onClick={(e) => { if (isRateLimited("start-measurement")) e.preventDefault(); }}
          >
            <button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground p-5 rounded-[1rem] shadow-xl shadow-primary/25 flex flex-col items-center justify-center gap-2 border border-white/10 group">
              <div className="bg-white/20 p-3 rounded-full">
                <UserPlus className="w-8 h-8 text-white" />
              </div>
              <span className="text-2xl font-bold font-display">
                Start Measurement
              </span>
            </button>
          </Link>

          <div className="flex-1">
            <button
              onClick={() => {
                if (isRateLimited("view-history")) return;
                requestHistoryAccess();
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
                requestHistoryAccess();
              }}
              className="text-primary text-lg font-semibold flex items-center gap-1"
            >
              View All <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="bg-card border border-border/50 rounded-2xl shadow-lg overflow-hidden backdrop-blur-md bg-white/80">
            {isLoading ? (
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

      <Dialog open={showHistoryPasscode} onOpenChange={(open) => !open && closeHistoryPasscode()}>
        <DialogContent className="max-w-sm rounded-2xl p-6">
          <h2 className="text-2xl font-bold text-center mb-2">Enter Password</h2>
          <p className="text-center text-muted-foreground mb-4">
            Enter 6-digit passcode
          </p>
          <div className="flex justify-center gap-2 mb-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="w-12 h-14 border-2 border-border rounded-lg flex items-center justify-center text-2xl font-bold"
              >
                {historyPasscode[i] ? "*" : ""}
              </div>
            ))}
          </div>

          {historyError && (
            <p className="text-red-500 text-center mb-4">{historyError}</p>
          )}

          <div className="grid grid-cols-3 gap-3 mb-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => { if (isRateLimited("history-pw-" + num)) return; handleHistoryKeyPress(num.toString()); }}
                className="h-16 text-2xl font-semibold bg-secondary rounded-xl"
              >
                {num}
              </button>
            ))}
            <button
              onClick={() => { if (isRateLimited("history-pw-del")) return; handleHistoryPasswordDelete(); }}
              className="h-16 flex items-center justify-center bg-muted rounded-xl"
            >
              <X className="w-6 h-6" />
            </button>
            <button
              onClick={() => { if (isRateLimited("history-pw-0")) return; handleHistoryKeyPress("0"); }}
              className="h-16 text-2xl font-semibold bg-secondary rounded-xl"
            >
              0
            </button>
            <button
              onClick={() => { if (isRateLimited("history-pw-submit")) return; handleHistoryPasswordSubmit(); }}
              disabled={historyPasscode.length !== 6 || isVerifyingHistory}
              className="h-16 flex items-center justify-center bg-primary text-white rounded-xl disabled:opacity-50"
            >
              {isVerifyingHistory ? <Loader2 className="w-6 h-6 animate-spin" /> : <Check className="w-6 h-6" />}
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
