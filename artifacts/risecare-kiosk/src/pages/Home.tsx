import { Link } from "wouter";
import { Activity, ArrowRight, ClipboardList, UserPlus } from "lucide-react";
import { format } from "date-fns";
import { useListSessions } from "@workspace/api-client-react";
import { motion } from "framer-motion";

export default function Home() {
  const { data: sessions, isLoading } = useListSessions();

  return (
    <div className="min-h-screen bg-background flex flex-col relative overflow-hidden">
      {/* Background Image Layer */}
      <div className="absolute inset-0 z-0">
        <img
          src={`${import.meta.env.BASE_URL}images/kiosk-bg.png`}
          alt="Background"
          className="w-full h-full object-cover opacity-60"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/80 to-background"></div>
      </div>

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-4 max-w-7xl mx-auto w-full">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-8"
        >
          <div className="w-16 h-16 bg-white rounded-3xl shadow-xl p-3 mx-auto mb-4 flex items-center justify-center border border-border/50">
            <img
              src={`${import.meta.env.BASE_URL}images/risecare-logo.png`}
              alt="RISECARE Logo"
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-3xl md:text-4xl font-display font-extrabold text-foreground mb-2 tracking-tight">
            Welcome to RISECARE
          </h1>
          <p className="text-xl md:text-xl text-muted-foreground font-medium max-w-3xl mx-auto leading-relaxed">
            Your comprehensive vital signs monitoring kiosk. Quick, accurate,
            and easy to use.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex flex-col md:flex-row gap-3 w-full max-w-2xl"
        >
          <Link href="/register" className="flex-1">
            <button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground p-5 rounded-[1rem] shadow-xl shadow-primary/25 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-2 border border-white/10 group">
              <div className="bg-white/20 p-3 rounded-full group-hover:scale-110 transition-transform">
                <UserPlus className="w-8 h-8 text-white" />
              </div>
              <span className="text-2xl font-bold font-display">
                Start Measurement
              </span>
            </button>
          </Link>

          <Link href="/history" className="flex-1">
            <button className="w-full bg-card hover:bg-secondary text-foreground p-5 rounded-[1rem] shadow-xl shadow-black/5 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-2 border border-border">
              <div className="bg-primary/10 p-3 rounded-full text-primary">
                <ClipboardList className="w-8 h-8" />
              </div>
              <span className="text-2xl font-bold font-display">
                View History
              </span>
            </button>
          </Link>
        </motion.div>

        {/* Recent Sessions widget */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-8 w-full max-w-2xl"
        >
          <div className="flex items-center justify-between mb-3 px-2">
            <h3 className="text-xl font-bold text-foreground">
              Recent Sessions
            </h3>
            <Link
              href="/history"
              className="text-primary text-lg font-semibold flex items-center gap-1"
            >
              View All <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="bg-card border border-border/50 rounded-2xl shadow-lg overflow-hidden backdrop-blur-md bg-white/80">
            {isLoading ? (
              <div className="p-6 text-center text-lg text-muted-foreground">
                Loading history...
              </div>
            ) : Array.isArray(sessions) && sessions.length > 0 ? (
              <div className="divide-y divide-border/50">
                {sessions.slice(0, 3).map((session) => (
                  <Link
                    href={`/session/${session.token}/results`}
                    key={session.id}
                  >
                    <div className="p-3 hover:bg-secondary/50 active:bg-secondary transition-colors cursor-pointer flex items-center justify-between">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                          <Activity className="w-4 h-4" />
                        </div>
                        <div>
                          <p className="text-xl font-bold text-foreground">
                            {session.patientName}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {format(
                              new Date(session.startedAt),
                              "MMM d, yyyy • h:mm a",
                            )}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-xl text-muted-foreground font-medium">
                No past sessions found.
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
