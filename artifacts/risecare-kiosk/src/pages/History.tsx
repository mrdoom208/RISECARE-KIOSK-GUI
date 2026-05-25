import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { useListSessions } from "@workspace/api-client-react";
import { KioskHeader } from "@/components/KioskHeader";
import { Calendar, ChevronRight, User } from "lucide-react";

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
  const { data: sessions, isLoading } = useListSessions();
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <KioskHeader title="Session History" showBack backTo="/" />

      <main className="flex-1 p-4 max-w-3xl mx-auto w-full">
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
                    onClick={() =>
                      setLocation(`/session/${session.token}/results`)
                    }
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
      </main>
    </div>
  );
}
