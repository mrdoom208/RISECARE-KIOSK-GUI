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

      <div className="relative z-10 flex-1 flex flex-col items-center justify-center p-8 max-w-7xl mx-auto w-full">
        
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <div className="w-32 h-32 bg-white rounded-3xl shadow-xl p-6 mx-auto mb-8 flex items-center justify-center border border-border/50">
            <img 
              src={`${import.meta.env.BASE_URL}images/risecare-logo.png`} 
              alt="RISECARE Logo" 
              className="w-full h-full object-contain"
            />
          </div>
          <h1 className="text-6xl md:text-8xl font-display font-extrabold text-foreground mb-4 tracking-tight">
            Welcome to RISECARE
          </h1>
          <p className="text-2xl md:text-3xl text-muted-foreground font-medium max-w-3xl mx-auto leading-relaxed">
            Your comprehensive vital signs monitoring kiosk. Quick, accurate, and easy to use.
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex flex-col md:flex-row gap-6 w-full max-w-4xl"
        >
          <Link href="/register" className="flex-1">
            <button className="w-full bg-primary hover:bg-primary/90 text-primary-foreground p-10 rounded-[2rem] shadow-xl shadow-primary/25 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-4 border border-white/10 group">
              <div className="bg-white/20 p-6 rounded-full group-hover:scale-110 transition-transform">
                <UserPlus className="w-16 h-16 text-white" />
              </div>
              <span className="text-4xl font-bold font-display">Start Measurement</span>
            </button>
          </Link>

          <Link href="/history" className="flex-1">
            <button className="w-full bg-card hover:bg-secondary text-foreground p-10 rounded-[2rem] shadow-xl shadow-black/5 active:scale-[0.98] transition-all flex flex-col items-center justify-center gap-4 border border-border">
              <div className="bg-primary/10 p-6 rounded-full text-primary">
                <ClipboardList className="w-16 h-16" />
              </div>
              <span className="text-4xl font-bold font-display">View History</span>
            </button>
          </Link>
        </motion.div>

        {/* Recent Sessions widget */}
        <motion.div 
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="mt-16 w-full max-w-4xl"
        >
          <div className="flex items-center justify-between mb-6 px-4">
            <h3 className="text-2xl font-bold text-foreground">Recent Sessions</h3>
            <Link href="/history" className="text-primary text-xl font-semibold flex items-center gap-2">
              View All <ArrowRight className="w-6 h-6" />
            </Link>
          </div>
          
          <div className="bg-card border border-border/50 rounded-3xl shadow-lg overflow-hidden backdrop-blur-md bg-white/80">
            {isLoading ? (
              <div className="p-12 text-center text-xl text-muted-foreground">Loading history...</div>
            ) : sessions && sessions.length > 0 ? (
              <div className="divide-y divide-border/50">
                {sessions.slice(0, 3).map(session => (
                  <Link href={`/session/${session.id}/results`} key={session.id}>
                    <div className="p-6 hover:bg-secondary/50 active:bg-secondary transition-colors cursor-pointer flex items-center justify-between">
                      <div className="flex items-center gap-5">
                        <div className="w-14 h-14 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                          <Activity className="w-7 h-7" />
                        </div>
                        <div>
                          <p className="text-2xl font-bold text-foreground">{session.patientName}</p>
                          <p className="text-lg text-muted-foreground">
                            {format(new Date(session.startedAt), "MMM d, yyyy • h:mm a")}
                          </p>
                        </div>
                      </div>
                      <ArrowRight className="w-8 h-8 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <div className="p-12 text-center text-2xl text-muted-foreground font-medium">
                No past sessions found.
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
