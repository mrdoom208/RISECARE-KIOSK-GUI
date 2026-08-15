import { useLocation } from "wouter";
import { format } from "date-fns";
import { KioskHeader } from "@/components/KioskHeader";
import {
  Calendar,
  ChevronRight,
  Loader2,
  Lock,
  Search,
  User,
  X,
} from "lucide-react";
import { useRateLimit } from "@/hooks/use-rate-limit";
import { useAdminAuth } from "@/hooks/use-admin-auth";
import LoginDialog from "@/components/LoginDialog";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

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

// "Juan Dela Cruz" -> "Juan D. C." (first name kept, rest as initials)
function abbreviateName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return fullName.trim();

  const [first, ...rest] = parts;
  const initials = rest
    .map((part) => part.charAt(0).toUpperCase() + ".")
    .join(" ");
  return `${first} ${initials}`;
}

export default function History() {
  const { isRateLimited } = useRateLimit(1000);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const [showLogin, setShowLogin] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);

  const {
    hasAccess,
    checking,
    loggingIn,
    login,
    logout,
    error: authError,
  } = useAdminAuth();

  const { data: sessions, isLoading, isError } = useQuery<any[]>({
    queryKey: ["history-sessions"],

    queryFn: async () => {
      const res = await fetch("/api/sessions");

      if (res.status === 401 || res.status === 403) {
        queryClient.removeQueries({
          queryKey: ["history-sessions"],
        });

        await logout();

        throw new Error("Unauthorized");
      }

      if (!res.ok) {
        throw new Error("Failed to load history");
      }

      return res.json();
    },

    enabled: hasAccess,
  });

  const handleLogout = async () => {
    queryClient.removeQueries({
      queryKey: ["history-sessions"],
    });

    await logout();
    setLocation("/");
  };

  const handleLogin = async (username: string, password: string) => {
    const success = await login(username, password, "history");

    if (success) {
      setShowLogin(false);
    }
  };

  const searchTerm = searchQuery.trim().toLowerCase();
  const filteredSessions = Array.isArray(sessions)
    ? sessions.filter((session) =>
        session.patientName?.toLowerCase().includes(searchTerm),
      )
    : [];

  return (
    <div className="h-dvh bg-background flex flex-col">
      <KioskHeader
        title="Session History"
        showBack={!hasAccess}
        backTo="/"
        onLogout={
          hasAccess
            ? () => {
                if (isRateLimited("history-logout")) return;
                setShowLogoutConfirm(true);
              }
            : undefined
        }
      />

      <main className="flex-1 min-h-0 overflow-y-auto">
        <div className="p-4 max-w-3xl mx-auto w-full">
          {checking ? (
            <div className="mt-16 rounded-2xl border border-border bg-card p-10 text-center shadow-lg">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>

              <h2 className="mb-2 text-2xl font-display font-bold text-foreground">
                Patient Records
              </h2>

              <p className="text-base text-muted-foreground">
                Checking administrator session...
              </p>
            </div>
          ) : !hasAccess ? (
            <div className="mt-16 rounded-2xl border border-border bg-card p-10 text-center shadow-lg">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Lock className="h-6 w-6" />
              </div>

              <h2 className="mb-2 text-2xl font-display font-bold text-foreground">
                Patient Records
              </h2>

              <p className="mx-auto max-w-md text-base text-muted-foreground">
                Administrator sign-in is required to view patient session
                history.
              </p>

              <button
                onClick={() => {
                  if (isRateLimited("history-login")) return;
                  setShowLogin(true);
                }}
                className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-8 py-3 text-xl font-semibold text-primary-foreground hover:bg-primary/90 active:scale-95 transition-transform"
              >
                Sign in
              </button>
            </div>
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-2xl font-display font-bold text-foreground">
                    Patient Records
                  </h2>

                  <p className="text-sm text-muted-foreground">
                    Previous measurement sessions
                  </p>
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search patient..."
                    className="w-full h-12 pl-10 pr-4 rounded-lg bg-background border-2 border-border outline-none transition-all focus:border-primary focus:ring-4 focus:ring-primary/10 text-base"
                  />
                </div>
              </div>

              <div className="bg-card rounded-xl shadow-lg border border-border overflow-hidden">
                {isLoading ? (
                  <div className="p-10 text-center">
                    <Loader2 className="mx-auto mb-3 h-7 w-7 animate-spin text-primary" />

                    <p className="text-lg font-medium text-muted-foreground">
                      Loading records...
                    </p>
                  </div>
                ) : isError ? (
                  <div className="p-10 text-center">
                    <h3 className="text-xl font-bold text-foreground">
                      Unable to load records
                    </h3>

                    <p className="mt-1 text-base text-muted-foreground">
                      Please try again.
                    </p>
                  </div>
                ) : filteredSessions.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[34rem] text-left border-collapse">
                      <thead>
                        <tr className="bg-secondary/50 text-muted-foreground text-base font-semibold border-b border-border/50">
                          <th className="p-4 pb-3 font-medium">Date & Time</th>
                          <th className="p-4 pb-3 font-medium">Patient</th>
                          <th className="p-4 pb-3 font-medium">Readings</th>
                          <th className="p-4 pb-3 font-medium text-right">
                            Action
                          </th>
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-border/50">
                        {filteredSessions.map((session) => {
                          const readings = countReadings(session.vitals);

                          return (
                            <tr
                              key={session.id}
                              onClick={() => {
                                if (isRateLimited("history-" + session.id)) {
                                  return;
                                }

                                setLocation(
                                  `/results?token=${encodeURIComponent(session.token)}&from=history`,
                                );
                              }}
                              className="hover:bg-muted/30 active:bg-secondary cursor-pointer group"
                            >
                              <td className="p-4">
                                <div className="flex items-center gap-2 text-base">
                                  <Calendar className="w-4 h-4 text-primary" />

                                  <div>
                                    <div className="font-bold text-foreground">
                                      {format(
                                        new Date(session.startedAt),
                                        "MMM d, yyyy",
                                      )}
                                    </div>

                                    <div className="text-sm text-muted-foreground">
                                      {format(
                                        new Date(session.startedAt),
                                        "h:mm a",
                                      )}
                                    </div>
                                  </div>
                                </div>
                              </td>

                              <td className="p-4">
                                <div className="flex items-center gap-3">
                                  <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
                                    <User className="w-4 h-4" />
                                  </div>

                                  <span className="text-lg font-bold text-foreground truncate">
                                    {abbreviateName(session.patientName)}
                                  </span>
                                </div>
                              </td>

                              <td className="p-4">
                                <span className="text-lg font-medium text-muted-foreground">
                                  {readings}{" "}
                                  {readings === 1 ? "reading" : "readings"}
                                </span>
                              </td>

                              <td className="p-4 text-right">
                                <button
                                  aria-label={`View ${session.patientName} record`}
                                  className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors"
                                >
                                  <ChevronRight className="w-5 h-5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-10 text-center flex flex-col items-center">
                    <div className="w-12 h-12 bg-secondary rounded-full flex items-center justify-center mb-3 text-muted-foreground">
                      <Search className="w-5 h-5" />
                    </div>

                    <h3 className="text-xl font-bold text-foreground mb-1">
                      {Array.isArray(sessions) && sessions.length > 0
                        ? "No Matching Records"
                        : "No Records Found"}
                    </h3>

                    <p className="text-base text-muted-foreground">
                      {Array.isArray(sessions) && sessions.length > 0
                        ? "No sessions match your search."
                        : "There are no measurement sessions recorded yet."}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </main>

      <LoginDialog
        open={showLogin}
        onOpenChange={setShowLogin}
        title="Admin Login"
        description="Enter your administrator credentials to view patient history."
        error={authError}
        verifying={loggingIn}
        onSubmit={handleLogin}
      />

      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm">
          <div className="bg-card rounded-3xl shadow-2xl p-8 w-full max-w-md border border-border/50">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-3xl font-bold">Logout</h2>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="p-2 rounded-full hover:bg-muted"
              >
                <X className="w-6 h-6" />
              </button>
            </div>
            <p className="text-center text-muted-foreground mb-6">
              Are you sure you want to logout?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  if (isRateLimited("history-logout-confirm")) return;
                  setShowLogoutConfirm(false);
                  void handleLogout();
                }}
                className="flex-1 h-14 rounded-xl bg-destructive text-white text-lg font-semibold"
              >
                Confirm
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="flex-1 h-14 rounded-xl bg-secondary text-lg font-semibold"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
