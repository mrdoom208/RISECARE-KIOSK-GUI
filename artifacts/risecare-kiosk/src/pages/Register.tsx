import { useState } from "react";
import { useLocation } from "wouter";
import { UserPlus, ArrowRight, User, Phone } from "lucide-react";
import { useCreateSession } from "@workspace/api-client-react";
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

export default function Register() {
  const { isRateLimited } = useRateLimit(1000);
  const [, setLocation] = useLocation();
  const { visible: keyboardVisible } = useVirtualKeyboard();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phoneRaw, setPhoneRaw] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");

  const createSession = useCreateSession();
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  const phoneValid = phoneDigits.length === 10 && phoneDigits[0] === "9";
  const phoneDisplay = formatPhoneDisplay(phoneRaw);
  const phoneError = phoneDigits.length > 0 && !phoneValid ? "Phone must start with 9 and be 10 digits" : "";

  const firstNameTrimmed = firstName.trim();
  const lastNameTrimmed = lastName.trim();
  const nameValid = firstNameTrimmed.length >= 1 && lastNameTrimmed.length >= 1;

  const ageNum = parseInt(age, 10);
  const ageValid = age.length > 0 && !Number.isNaN(ageNum) && ageNum >= 1 && ageNum <= 120;
  const ageError = age.length > 0 && !Number.isNaN(ageNum) && (ageNum < 1 || ageNum > 120) ? "Age must be between 1 and 120" : "";

  const allFilled = nameValid && phoneValid && ageValid && gender;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, "").slice(0, 10);
    setPhoneRaw(value);
  };

  const handleStart = () => {
    if (!nameValid || !phoneValid || !ageValid || !gender) return;

    createSession.mutate(
      {
        data: {
          patientFirstName: firstNameTrimmed,
          patientLastName: lastNameTrimmed,
          patientPhone: PH_PREFIX + phoneDigits,
          patientAge: parseInt(age, 10),
          patientGender: gender,
        },
      },
      {
        onSuccess: (session) => {
          setLocation("/dashboard", { state: { token: session.token } });
        },
      },
    );
  };

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden" style={{ height: "100dvh" }}>
      <KioskHeader title="Patient Registration" showBack backTo="/" />

      <main
        className={`flex-1 min-h-0 flex justify-center overflow-y-auto overscroll-contain p-4 transition-[padding] duration-200 ${
          keyboardVisible ? "items-start pt-3 pb-80" : "items-center"
        }`}
      >
        <div className="w-full max-w-2xl bg-card rounded-xl shadow-xl border border-border/50 overflow-hidden">
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
                <UserPlus className={keyboardVisible ? "w-7 h-7" : "w-10 h-10"} />
              </div>
              <div>
                <h2 className={`${keyboardVisible ? "text-xl" : "text-2xl"} font-bold font-display`}>
                  Personal Information
                </h2>
                <p className={`${keyboardVisible ? "text-sm" : "text-base"} text-muted-foreground mt-1`}>
                  Enter details to begin the measurement session
                </p>
              </div>
            </div>

            <div className={keyboardVisible ? "space-y-4" : "space-y-5"}>
              <div className="grid grid-cols-1 sm:grid-cols-2 portrait:grid-cols-1 gap-4">
                <div className="space-y-2.5">
                  <label className="text-xl font-semibold text-foreground flex items-center gap-2">
                    <User className="w-8 h-8 text-primary" /> First Name{" "}
                    <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value.replace(/[0-9]/g, ""))}
                    placeholder="First name"
                    className="w-full h-12 px-4 text-xl rounded-lg bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none placeholder:text-muted-foreground"
                  />
                </div>

                <div className="space-y-2.5">
                  <label className="text-xl font-semibold text-foreground flex items-center gap-2">
                    Last Name <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value.replace(/[0-9]/g, ""))}
                    placeholder="Last name"
                    className="w-full h-12 px-4 text-xl rounded-lg bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none placeholder:text-muted-foreground"
                  />
                </div>
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
                    className={`no-spinner w-full h-12 pl-16 pr-4 text-xl rounded-lg bg-background border-2 ${phoneError ? "border-destructive" : "border-border"} focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none placeholder:text-muted-foreground`}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 portrait:grid-cols-1 gap-4">
                <div className="space-y-2.5">
                  <label className="text-xl font-semibold text-foreground flex items-center gap-2">
                    Age <span className="text-destructive">*</span>
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={age}
                    onChange={(e) => setAge(e.target.value.replace(/\D/g, "").slice(0, 3))}
                    placeholder="Years"
                    className={`no-spinner w-full h-12 px-4 text-xl rounded-lg bg-background border-2 ${ageError ? "border-destructive" : "border-border"} focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none`}
                  />
                  {ageError && <p className="text-destructive text-sm mt-1">{ageError}</p>}
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

          <div className="p-4 bg-secondary/30 border-t border-border flex flex-col items-end gap-1">
            {!allFilled && !createSession.isPending && (
              <p className="text-sm text-muted-foreground">Fill in all required fields to continue</p>
            )}
            <button
              onClick={() => {
                if (isRateLimited("begin-session")) return;
                handleStart();
              }}
              disabled={
                !nameValid || !phoneValid || !ageValid || !gender || createSession.isPending
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
