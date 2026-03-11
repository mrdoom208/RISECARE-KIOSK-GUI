import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { useListSessions } from "@workspace/api-client-react";
import { KioskHeader } from "@/components/KioskHeader";
import { Calendar, ChevronRight, User } from "lucide-react";

export default function History() {
  const { data: sessions, isLoading } = useListSessions();
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <KioskHeader title="Session History" showBack backTo="/" />

      <main className="flex-1 p-8 max-w-6xl mx-auto w-full">
        <h2 className="text-4xl font-display font-bold text-foreground mb-8">Patient Records</h2>

        <div className="bg-card rounded-3xl shadow-xl border border-border overflow-hidden">
          {isLoading ? (
            <div className="p-20 text-center text-3xl font-medium text-muted-foreground">Loading records...</div>
          ) : sessions && sessions.length > 0 ? (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/50 text-muted-foreground text-xl font-semibold border-b border-border/50">
                  <th className="p-8 pb-6 font-medium">Date & Time</th>
                  <th className="p-8 pb-6 font-medium">Patient Name</th>
                  <th className="p-8 pb-6 font-medium">Readings Taken</th>
                  <th className="p-8 pb-6 font-medium text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {sessions.map(session => (
                  <tr 
                    key={session.id} 
                    onClick={() => setLocation(`/session/${session.id}/results`)}
                    className="hover:bg-muted/30 active:bg-secondary cursor-pointer transition-colors group"
                  >
                    <td className="p-8">
                      <div className="flex items-center gap-4 text-xl">
                        <Calendar className="w-8 h-8 text-primary" />
                        <span className="font-bold text-foreground">
                          {format(new Date(session.startedAt), "MMM d, yyyy")}
                        </span>
                        <span className="text-muted-foreground">
                          {format(new Date(session.startedAt), "h:mm a")}
                        </span>
                      </div>
                    </td>
                    <td className="p-8">
                      <div className="flex items-center gap-4 text-2xl font-bold text-foreground">
                        <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                          <User className="w-6 h-6" />
                        </div>
                        {session.patientName}
                      </div>
                    </td>
                    <td className="p-8 text-2xl font-medium text-muted-foreground">
                      {session.vitals?.length || 0} Records
                    </td>
                    <td className="p-8 text-right">
                      <button className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-secondary text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-all">
                        <ChevronRight className="w-8 h-8" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="p-20 text-center flex flex-col items-center">
              <div className="w-24 h-24 bg-secondary rounded-full flex items-center justify-center mb-6 text-muted-foreground">
                <Calendar className="w-10 h-10" />
              </div>
              <h3 className="text-3xl font-bold text-foreground mb-2">No Records Found</h3>
              <p className="text-xl text-muted-foreground">There are no measurement sessions recorded yet.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
