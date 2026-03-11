import { useState } from "react";
import { useLocation } from "wouter";
import { UserPlus, ArrowRight, User } from "lucide-react";
import { useCreateSession } from "@workspace/api-client-react";
import { KioskHeader } from "@/components/KioskHeader";

export default function Register() {
  const [, setLocation] = useLocation();
  const [name, setName] = useState("");
  const [age, setAge] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "other" | "prefer_not_to_say" | "">("");

  const createSession = useCreateSession();

  const handleStart = () => {
    if (!name) return;
    
    createSession.mutate(
      { 
        data: {
          patientName: name,
          patientAge: age ? parseInt(age, 10) : undefined,
          patientGender: gender || undefined
        }
      },
      {
        onSuccess: (session) => {
          setLocation(`/session/${session.id}`);
        }
      }
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <KioskHeader title="Patient Registration" showBack backTo="/" />

      <main className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-3xl bg-card rounded-[2.5rem] shadow-xl border border-border/50 overflow-hidden">
          <div className="p-12">
            <div className="flex items-center gap-6 mb-12">
              <div className="w-20 h-20 bg-primary/10 rounded-full flex items-center justify-center text-primary">
                <UserPlus className="w-10 h-10" />
              </div>
              <div>
                <h2 className="text-4xl font-bold font-display">New Patient</h2>
                <p className="text-xl text-muted-foreground mt-2">Enter details to begin the measurement session</p>
              </div>
            </div>

            <div className="space-y-10">
              <div className="space-y-4">
                <label className="text-2xl font-semibold text-foreground flex items-center gap-3">
                  <User className="w-6 h-6 text-primary" /> Full Name <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Tap to enter patient name"
                  className="w-full h-24 px-8 text-3xl rounded-2xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/20 outline-none transition-all placeholder:text-muted-foreground"
                />
              </div>

              <div className="grid grid-cols-2 gap-8">
                <div className="space-y-4">
                  <label className="text-2xl font-semibold text-foreground">Age (Optional)</label>
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    placeholder="Years"
                    className="w-full h-24 px-8 text-3xl rounded-2xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/20 outline-none transition-all"
                  />
                </div>
                
                <div className="space-y-4">
                  <label className="text-2xl font-semibold text-foreground">Gender (Optional)</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full h-24 px-8 text-3xl rounded-2xl bg-background border-2 border-border focus:border-primary focus:ring-4 focus:ring-primary/20 outline-none transition-all appearance-none"
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

          <div className="p-8 bg-secondary/30 border-t border-border flex justify-end">
            <button
              onClick={handleStart}
              disabled={!name || createSession.isPending}
              className="h-24 px-12 text-3xl font-bold bg-primary text-primary-foreground rounded-2xl shadow-xl shadow-primary/25 disabled:opacity-50 disabled:shadow-none active:scale-95 transition-all flex items-center justify-center gap-4"
            >
              {createSession.isPending ? "Starting..." : "Begin Session"}
              {!createSession.isPending && <ArrowRight className="w-8 h-8" />}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
