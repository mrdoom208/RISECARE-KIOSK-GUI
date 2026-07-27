import { useLocation } from "wouter";
import { format } from "date-fns";
import { KioskHeader } from "@/components/KioskHeader";
import { Calendar, Check, ChevronRight, User, X } from "lucide-react";
import { useRateLimit } from "@/hooks/use-rate-limit";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
} from "@/components/ui/dialog";

const HISTORY_ACCESS_KEY = "risecare-history-access";

const readingFields = [
  "bloodPressureSystolic",
  "bloodPressureDiastolic",
  "heartRate",
  "oxygenSaturation",
  "temperature",
  "weight",
  "height",
];

function countReadings(vitals: any) {
  if (!vitals) return 0;
  const latest = Array.isArray(vitals) ? vitals[0] : vitals;
  if (!latest) return 0;

  return readingFields.filter((field) => latest[field] != null).length;
}

export default function History() {
  const { isRateLimited } = useRateLimit(1000);
  const [, setLocation] = useLocation();
  const [hasAccess, setHasAccess] = useState(
    () => sessionStorage.getItem(HISTORY_ACCESS_KEY) === "true",
  );
  const [passcode, setPasscode] = useState("");
  const [error, setError] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const { data: sessions, isLoading } = useQuery<any[]>({
    queryKey: ["history-sessions"],
    queryFn: async () => {
      const res = await fetch("/api/sessions");
      if (!res.ok) throw new Error("Failed to load history");
      return res.json();
    },
    enabled: hasAccess,
  });

  const closePasscode = () => {
    setPasscode("");
    setError("");
    setIsVerifying(false);
    setLocation("/");
  };

  const handleKeyPress = (num: string) => {
    if (passcode.length < 6) {
      setError("");
      setPasscode((prev) => prev + num);
    }
  };

  const handlePasswordDelete = () => {
    setError("");
    setPasscode((prev) => prev.slice(0, -1));
  };

  const handlePasswordSubmit = async () => {
    if (passcode.length !== 6 || isVerifying) return;

    try {
      setIsVerifying(true);
      const res = await fetch("/api/settings/verify-passcode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode, context: "history" }),
      });
      const data = await res.json();

      if (data.success) {
        sessionStorage.setItem(HISTORY_ACCESS_KEY, "true");
        setHasAccess(true);
        setPasscode("");
        setError("");
      } else {
        setError("Incorrect passcode");
        setPasscode("");
      }
    } catch {
      setError("Failed to verify passcode");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <KioskHeader title="Session History" showBack backTo="/" />

      <main className="flex-1 p-4 max-w-3xl mx-auto w-full">
        {!hasAccess ? (
          <div className="mt-16 rounded-xl border border-border bg-card p-10 text-center shadow-xl">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Calendar className="h-6 w-6" />
            </div>
            <h2 className="mb-2 text-2xl font-display font-bold text-foreground">
              Patient Records Locked
            </h2>
            <p className="text-base text-muted-foreground">
              Enter an admin passcode to view session history.
            </p>
          </div>
        ) : (
          <>
        <h2 className="text-2xl font-display font-bold text-foreground mb-4">
          Patient Records
        </h2>

        <div className="bg-card rounded-xl shadow-xl border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-10 text-center text-xl font-medium text-muted-foreground">
              Loading records...
            </div>
          ) : Array.isArray(sessions) && sessions.length > 0 ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/50 text-muted-foreground text-base font-semibold border-b border-border/50">
                  <th className="p-4 pb-3 font-medium">Date & Time</th>
                  <th className="p-4 pb-3 font-medium">Patient Name</th>
                  <th className="p-4 pb-3 font-medium">Readings Taken</th>
                  <th className="p-4 pb-3 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {sessions.map((session) => (
                  <tr
                    key={session.id}
                    onClick={() => {
                      if (isRateLimited("history-" + session.id)) return;
                      setLocation(`/session/${session.token}/results`);
                    }}
                    className="hover:bg-muted/30 active:bg-secondary cursor-pointer group"
                  >
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-base">
                        <Calendar className="w-4 h-4 text-primary" />
                        <span className="font-bold text-foreground">
                          {format(new Date(session.startedAt), "MMM d, yyyy")}
                        </span>
                        <span className="text-muted-foreground">
                          {format(new Date(session.startedAt), "h:mm a")}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2 text-xl font-bold text-foreground">
                        <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          <User className="w-3 h-3" />
                        </div>
                        {session.patientName}
                      </div>
                    </td>
                    <td className="p-4 text-xl font-medium text-muted-foreground">
                      {countReadings(session.vitals)} Records
                    </td>
                    <td className="p-4 text-right">
                      <button className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground">
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-10 text-center flex flex-col items-center">
              <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mb-3 text-muted-foreground">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-1">
                No Records Found
              </h3>
              <p className="text-base text-muted-foreground">
                There are no measurement sessions recorded yet.
              </p>
            </div>
          )}
        </div>
          </>
        )}
      </main>

      <Dialog open={!hasAccess} onOpenChange={(open) => !open && closePasscode()}>
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
                {passcode[i] ? "*" : ""}
              </div>
            ))}
          </div>

          {error && (
            <p className="text-red-500 text-center mb-4">{error}</p>
          )}

          <div className="grid grid-cols-3 gap-3 mb-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button
                key={num}
                onClick={() => { if (isRateLimited("history-pw-" + num)) return; handleKeyPress(num.toString()); }}
                className="h-16 text-2xl font-semibold bg-secondary rounded-xl"
              >
                {num}
              </button>
            ))}
            <button
              onClick={() => { if (isRateLimited("history-pw-del")) return; handlePasswordDelete(); }}
              className="h-16 flex items-center justify-center bg-muted rounded-xl"
            >
              <X className="w-6 h-6" />
            </button>
            <button
              onClick={() => { if (isRateLimited("history-pw-0")) return; handleKeyPress("0"); }}
              className="h-16 text-2xl font-semibold bg-secondary rounded-xl"
            >
              0
            </button>
            <button
              onClick={() => { if (isRateLimited("history-pw-submit")) return; handlePasswordSubmit(); }}
              disabled={passcode.length !== 6 || isVerifying}
              className="h-16 flex items-center justify-center bg-primary text-white rounded-xl disabled:opacity-50"
            >
              <Check className="w-6 h-6" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
