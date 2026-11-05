import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { AlertCircle, ArrowRight, Calendar, Search } from "lucide-react";
import { useFindSessions } from "@workspace/api-client-react";
import { useRateLimit } from "@/hooks/use-rate-limit";
import { useVirtualKeyboard } from "@/hooks/use-virtual-keyboard";
import { KioskHeader } from "@/components/KioskHeader";
import { apiErrorMessage } from "@/lib/api-error";

export default function FindSession() {
  const { isRateLimited } = useRateLimit(1000);
  const [, setLocation] = useLocation();
  const { visible: keyboardVisible } = useVirtualKeyboard();
  const [reference, setReference] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const findSessions = useFindSessions();

  const referenceTrimmed = reference.trim().toUpperCase();
  const referenceValid = /^[A-Z0-9]{4,12}$/.test(referenceTrimmed);
  const referenceError =
    referenceTrimmed.length > 0 && !referenceValid
      ? "Enter a valid reference using 4–12 letters or numbers"
      : "";

  const canSearch = referenceValid;

  const errorMessage =
    findSessions.isError && !findSessions.isPending
      ? apiErrorMessage(
          findSessions.error?.data,
          "Something went wrong. Please try again.",
          findSessions.error?.status,
        )
      : "";

  const handleSearch = () => {
    if (!canSearch || findSessions.isPending) return;
    setSubmitted(true);
    findSessions.mutate({
      data: { reference: referenceTrimmed },
    });
  };

  const results = Array.isArray(findSessions.data) ? findSessions.data : [];

  return (
    <div
      className="h-screen bg-background flex flex-col overflow-hidden"
      style={{ height: "100dvh" }}
    >
      <KioskHeader title="Find My Session" showBack backTo="/" />

      <main
        className={`flex-1 min-h-0 flex justify-center overflow-y-auto overscroll-contain p-4 ${
          keyboardVisible ? "items-start pt-3 pb-80" : "items-center"
        }`}
      >
        <div className="w-full max-w-2xl flex flex-col gap-4">
          <div className="bg-card rounded-xl shadow-xl border border-border/50 overflow-hidden">
            <div className={keyboardVisible ? "p-5" : "p-6"}>
              <div
                className={
                  keyboardVisible
                    ? "flex items-center gap-3 mb-4"
                    : "flex items-center gap-3 mb-6"
                }
              >
                <div
                  className={`${
                    keyboardVisible ? "w-12 h-12" : "w-15 h-15"
                  } bg-primary/10 rounded-full flex items-center justify-center text-primary shrink-0`}
                >
                  <Search
                    className={keyboardVisible ? "w-7 h-7" : "w-10 h-10"}
                  />
                </div>
                <div>
                  <h2 className={`${keyboardVisible ? "text-xl" : "text-2xl"} font-bold font-display`}>
                    Look up a Session
                  </h2>
                  <p className={`${keyboardVisible ? "text-sm" : "text-base"} text-muted-foreground mt-1`}>
                    Enter your session reference to find your results
                  </p>
                </div>
              </div>

              <div className={keyboardVisible ? "space-y-4" : "space-y-5"}>
                <div className="space-y-2.5">
                  <label className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <Search className="w-8 h-8 text-primary" /> Reference
                  </label>
                  <input
                    type="text"
                    value={reference}
                    onChange={(e) => {
                      const value = e.target.value
                        .toUpperCase()
                        .replace(/[^A-Z0-9]/g, "")
                        .slice(0, 12);
                      setReference(value);
                      if (value !== referenceTrimmed) {
                        setSubmitted(false);
                        findSessions.reset();
                      }
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleSearch();
                    }}
                    placeholder="e.g. AB12CD"
                    className={`no-spinner w-full h-12 px-4 text-xl tracking-widest uppercase rounded-lg bg-background border-2 ${referenceError ? "border-destructive" : "border-border"} focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none placeholder:text-muted-foreground placeholder:normal-case placeholder:tracking-normal`}
                  />
                  {referenceError && (
                    <p className="text-destructive text-sm mt-1">
                      {referenceError}
                    </p>
                  )}
                </div>
              </div>
            </div>

            <div className="p-4 bg-secondary/30 border-t border-border flex flex-col items-end gap-1">
              {errorMessage && (
                <p className="text-sm text-destructive">
                  {errorMessage}
                </p>
              )}
              <button
                onClick={() => {
                  if (isRateLimited("find-session")) return;
                  handleSearch();
                }}
                disabled={!canSearch || findSessions.isPending}
                className="h-12 px-6 text-xl font-bold bg-primary text-primary-foreground rounded-lg shadow-xl shadow-primary/25 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
              >
                {findSessions.isPending ? "Searching..." : "Find Session"}
                {!findSessions.isPending && <ArrowRight className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {findSessions.isPending && (
            <div className="bg-card rounded-xl shadow-lg border border-border/50 p-8 text-center">
              <p className="text-lg text-muted-foreground">
                Searching for your session...
              </p>
            </div>
          )}

          {submitted && !findSessions.isPending && !findSessions.isError && results.length === 0 && (
            <div className="bg-card rounded-xl shadow-lg border border-border/50 p-8 text-center">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                <AlertCircle className="h-6 w-6" />
              </div>
              <h3 className="text-xl font-bold text-foreground mb-1">
                No session found
              </h3>
              <p className="text-base text-muted-foreground">
                We could not find a session matching your reference. Please check
                your entry and try again.
              </p>
            </div>
          )}

          {results.length > 0 && (
            <div className="bg-card rounded-xl shadow-lg border border-border/50 overflow-hidden">
              <div className="p-4 border-b border-border/50">
                <h3 className="text-xl font-bold text-foreground">
                  {results.length === 1 ? "1 session found" : `${results.length} sessions found`}
                </h3>
              </div>
              <div className="divide-y divide-border/50">
                {results.map((session) => (
                  <button
                    key={session.id}
                    type="button"
                    onClick={() => {
                      if (isRateLimited("find-session-" + session.id)) return;
                      setLocation(
                        `/results?token=${encodeURIComponent(session.token || "")}&from=find`,
                      );
                    }}
                    className="w-full text-left p-4 flex items-center justify-between gap-3 hover:bg-muted/30 active:bg-secondary transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-lg font-bold text-foreground truncate">
                          {session.patientName}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(session.startedAt), "MMM d, yyyy • h:mm a")}
                        </p>
                      </div>
                    </div>
                    <span className="shrink-0 inline-flex items-center gap-1.5 text-primary font-semibold text-lg">
                      View <ArrowRight className="w-4 h-4" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
