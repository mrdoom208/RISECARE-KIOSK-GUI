import { useState } from "react";
import { useLocation } from "wouter";
import { UserPlus, ArrowRight, User, Phone } from "lucide-react";
import { useCreateSession } from "@workspace/api-client-react";
import { KioskHeader } from "@/components/KioskHeader";

const PH_PREFIX = "+63";

function formatPhoneDisplay(digits: string): string {
  const d = digits.replace(/\D/g, "").slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`;
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
}

export default function Register() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");

  const createSession = useCreateSession();
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  const phoneValid = phoneDigits.length === 10 && phoneDigits[0] === "9";
  const phoneDisplay = formatPhoneDisplay(phoneRaw);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10);
    setPhoneRaw(value);
  };

  const handleStart = () => {
    if (!name || !phoneRaw || !age || !gender) return;
    if (!phoneValid) return;

    createSession.mutate(
      {
        data: {
          patientName: name,
          patientPhone: PH_PREFIX + phoneDigits,
          patientAge: parseInt(age, 10),
          patientGender: gender,
        },
      },
      {
        onSuccess: (session) => {
          setLocation(`/session/${session.token}`);
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col" style={{ minHeight: "100dvh" }}>
      <KioskHeader title="Patient Registration" showBack backTo="/" />

      <main className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-xl bg-card rounded-xl shadow-xl border border-border/50 overflow-hidden">
          <div className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-15 h-15 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <UserPlus className="w-10 h-10" />
              </div>
              <div>
                <h2 className="text-2xl font-bold font-display">
                  Personal Information
                </h2>
                <p className="text-base text-muted-foreground mt-1">
                  Enter details to begin the measurement session
                </p>
              </div>
            </div>

            <div className="space-y-5">
              <div className="space-y-2.5">
                <label className="text-xl font-semibold text-foreground flex items-center gap-2">
                  <User className="w-8 h-8 text-primary" /> Full Name{" "}
                  <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value.replace(/[0-9]/g, ""))}
                  placeholder="Tap to enter patient name"
className="w-full h-12 px-4 text-xl rounded-lg bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none placeholder:text-muted-foreground"
                  />
                </div>

              <div className="space-y-2.5">
                <label className="text-xl font-semibold text-foreground flex items-center gap-2">
                  <Phone className="w-8 h-8 text-primary" /> Phone No.{" "}
                  <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl text-muted-foreground font-medium z-10">
                    +63
                  </span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    value={phoneDisplay}
                    onChange={handlePhoneChange}
                    placeholder="912 345 6789"
                    className="no-spinner w-full h-12 pl-16 pr-4 text-xl rounded-lg bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2.5">
                  <label className="text-xl font-semibold text-foreground flex items-center gap-2">
                    Age <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="999"
                    value={age}
                    onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    placeholder="Years"
                    className="w-full h-12 px-4 text-xl rounded-lg bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none"
                  />
                </div>

                <div className="space-y-2.5">
                  <label className="text-xl font-semibold text-foreground flex items-center gap-2">
                    Sex <span className="text-destructive">*</span>
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full h-12 px-4 text-xl rounded-lg bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none appearance-none"
                  >
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-secondary/30 border-t border-border flex justify-end">
            <button
              onClick={handleStart}
              disabled={
                !name || !phoneValid || !age || !gender || createSession.isPending
              }
              className="h-12 px-6 text-xl font-bold bg-primary text-primary-foreground rounded-lg shadow-xl shadow-primary/25 disabled:opacity-50 disabled:shadow-none flex items-center justify-center gap-2"
            >
              {createSession.isPending ? "Starting..." : "Begin Session"}
              {!createSession.isPending && <ArrowRight className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
