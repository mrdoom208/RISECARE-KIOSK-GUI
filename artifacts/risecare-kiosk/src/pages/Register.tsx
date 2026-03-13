import { useState } from "react";
import { useLocation } from "wouter";
import { UserPlus, ArrowRight, User, Phone } from "lucide-react";
import { useCreateSession } from "@workspace/api-client-react";
import { KioskHeader } from "@/components/KioskHeader";

export default function Register() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<
    "male" | "female" | "other" | "prefer_not_to_say" | ""
  >("");

  const createSession = useCreateSession();

  const handleStart = () => {
    if (!name) return;

    createSession.mutate(
      {
        data: {
          patientName: name,
          patientPhone: phone,
          patientAge: age ? parseInt(age, 10) : undefined,
          patientGender: gender || undefined,
        },
      },
      {
        onSuccess: (session) => {
          setLocation(`/session/${session.id}`);
        },
      },
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
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
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tap to enter patient name"
                  className="w-full h-12 px-4 text-xl rounded-lg bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-muted-foreground"
                />
              </div>

              <div className="space-y-2.5">
                <label className="text-xl font-semibold text-foreground flex items-center gap-2">
                  <Phone className="w-8 h-8 text-primary" /> Phone No.{" "}
                  <span className="text-destructive">*</span>
                </label>
                <input
                  type="number"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="Tap to enter phone number"
                  className="no-spinner w-full h-12 px-4 text-xl rounded-lg bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all placeholder:text-muted-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2.5">
                  <label className="text-xl font-semibold text-foreground">
                    Age (Optional)
                  </label>
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="Years"
                    className="w-full h-12 px-4 text-xl rounded-lg bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>

                <div className="space-y-2.5">
                  <label className="text-xl font-semibold text-foreground">
                    Gender (Optional)
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full h-12 px-4 text-xl rounded-lg bg-background border-2 border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all appearance-none"
                  >
                    <option value="">Select...</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                    <option value="prefer_not_to_say">Prefer not to say</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="p-4 bg-secondary/30 border-t border-border flex justify-end">
            <button
              onClick={handleStart}
              disabled={!name || createSession.isPending || phone.length < 11}
              className="h-12 px-6 text-xl font-bold bg-primary text-primary-foreground rounded-lg shadow-xl shadow-primary/25 disabled:opacity-50 disabled:shadow-none active:scale-95 transition-all flex items-center justify-center gap-2"
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
