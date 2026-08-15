import { useState } from "react";
import { useLocation } from "wouter";
import { format } from "date-fns";
import { AlertCircle, ArrowRight, Calendar, Phone, Search } from "lucide-react";
import { useFindSessions } from "@workspace/api-client-react";
import { useRateLimit } from "@/hooks/use-rate-limit";
import { useVirtualKeyboard } from "@/hooks/use-virtual-keyboard";
import { KioskHeader } from "@/components/KioskHeader";

const PH_PREFIX = "+63";

function formatPhoneDisplay(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

export default function FindSession() {
  const { isRateLimited } = useRateLimit(1000);
  const [, setLocation] = useLocation();
  const { visible: keyboardVisible } = useVirtualKeyboard();
  const [mode, setMode] = useState<"phone" | "reference">("phone");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [reference, setReference] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const findSessions = useFindSessions();

  const phoneDigits = phoneRaw.replace(/\D/g, "");
  const phoneValid = /^9\d{9}$/.test(phoneDigits);
  const phoneDisplay = formatPhoneDisplay(phoneRaw);
  const phoneError =
    phoneDigits.length > 0 && !phoneValid
      ? "Invalid Phone number"
      : "";

  const referenceTrimmed = reference.trim().toUpperCase();
  const referenceValid = /^[A-Z0-9]{4,12}$/.test(referenceTrimmed);
  const referenceError =
    referenceTrimmed.length > 0 && !referenceValid
      ? "Invalid Reference"
      : "";

  const canSearch =
    mode === "phone"
      ? phoneValid
      : referenceValid;

  const errorMessage =
    findSessions.isError && !findSessions.isPending
      ? findSessions.error?.data?.message ??
        "Something went wrong. Please try again."
      : "";

  const handleSearch = () => {
    if (!canSearch || findSessions.isPending) return;
    setSubmitted(true);
    findSessions.mutate(
      {
        data:
          mode === "phone"
            ? { phone: PH_PREFIX + phoneDigits }
            : { reference: referenceTrimmed },
      },
      {
        onSuccess: () => {
          if (mode === "phone") {
            setReference("");
          } else {
            setPhoneRaw("");
          }
        },
      },
    );
  };

  const results = Array.isArray(findSessions.data) ? findSessions.data : [];

  return (
    <div
      className="h-screen bg-background flex flex-col overflow-hidden"
      style={{ height: "100dvh" }}
    >
      <KioskHeader title="Find My Session" showBack backTo="/" />

      <main
        className={`flex-1 min-h-0 flex justify-center overflow-y-auto overscroll-contain p-4 transition-[padding] duration-200 ${
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
                    Enter your phone number or reference to find your results
                  </p>
                </div>
              </div>

              <div className="flex rounded-xl bg-secondary/50 p-1 mb-5">
                <button
                  type="button"
                  onClick={() => {
                    setMode("phone");
                    setSubmitted(false);
                    findSessions.reset();
                  }}
                  className={`flex-1 h-12 rounded-lg flex items-center justify-center gap-2 text-lg font-semibold transition-colors ${
                    mode === "phone"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground"
                  }`}
                >
                  <Phone className="w-5 h-5" /> Phone Number
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMode("reference");
                    setSubmitted(false);
                    findSessions.reset();
                  }}
                  className={`flex-1 h-12 rounded-lg flex items-center justify-center gap-2 text-lg font-semibold transition-colors ${
                    mode === "reference"
                      ? "bg-primary text-primary-foreground shadow"
                      : "text-muted-foreground"
                  }`}
                >
                  <Search className="w-5 h-5" /> Reference
                </button>
              </div>

              <div className={keyboardVisible ? "space-y-4" : "space-y-5"}>
                {mode === "phone" ? (
                  <div className="space-y-2.5">
                    <label className="text-xl font-semibold text-foreground flex items-center gap-2">
                      <Phone className="w-8 h-8 text-primary" /> Phone No.
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-muted-foreground font-medium z-10">
                        +63
                      </span>
                      <input
                        type="tel"
                        inputMode="numeric"
                        value={phoneDisplay}
                        onChange={(e) => {
                          const value = e.target.value
                            .replace(/\D/g, "")
                            .slice(0, 10);
                          setPhoneRaw(value);
                          if (value !== phoneDigits) {
                            setSubmitted(false);
                            findSessions.reset();
                          }
                        }}
                        placeholder="912 345 6789"
                        className={`no-spinner w-full h-12 pl-16 pr-4 text-xl rounded-lg bg-background border-2 ${phoneError ? "border-destructive" : "border-border"} focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none placeholder:text-muted-foreground`}
                      />
                    </div>
                    {phoneError && (
                      <p className="text-destructive text-sm mt-1">
                        {phoneError}
                      </p>
                    )}
                  </div>
                ) : (
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
                      placeholder="e.g. AB12CD"
                      className={`no-spinner w-full h-12 px-4 text-xl tracking-widest uppercase rounded-lg bg-background border-2 ${referenceError ? "border-destructive" : "border-border"} focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none placeholder:text-muted-foreground placeholder:normal-case placeholder:tracking-normal`}
                    />
                    {referenceError && (
                      <p className="text-destructive text-sm mt-1">
                        {referenceError}
                      </p>
                    )}
                  </div>
                )}
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
                We could not find a session matching your{" "}
                {mode === "phone" ? "phone number" : "reference"}. Please check
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
