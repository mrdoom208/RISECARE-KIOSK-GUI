import { useRoute, useLocation } from "wouter";
import { useGetSession } from "@workspace/api-client-react";
import { KioskHeader } from "@/components/KioskHeader";
import { Printer, Home, CheckCircle } from "lucide-react";
import { getBPStatus, getHRStatus, getSpO2Status, getTempStatus, getGlucoseStatus, getBMIStatus, calculateBMI, getStatusColor, VitalStatus } from "@/lib/vitals-utils";
import { useMemo } from "react";

export default function Results() {
  const [, params] = useRoute("/session/:id/results");
  const [, setLocation] = useLocation();
  const sessionId = parseInt(params?.id || "0", 10);

  const { data: session, isLoading } = useGetSession(sessionId);

  const currentVitals = useMemo(() => {
    if (!session?.vitals) return {};
    return session.vitals.reduce((acc, curr) => ({ ...acc, ...curr }), {});
  }, [session]);

  const autoBMI = calculateBMI(currentVitals.weight, currentVitals.height);

  if (isLoading) return <div className="min-h-screen bg-background pt-32 text-center text-3xl text-muted-foreground">Loading results...</div>;
  if (!session) return <div className="min-h-screen bg-background pt-32 text-center text-3xl text-destructive">Session not found</div>;

  const resultsList = [
    { 
      name: "Blood Pressure", 
      val: currentVitals.bloodPressureSystolic ? `${currentVitals.bloodPressureSystolic}/${currentVitals.bloodPressureDiastolic}` : null, 
      unit: "mmHg", 
      status: getBPStatus(currentVitals.bloodPressureSystolic, currentVitals.bloodPressureDiastolic),
      msg: getBPMessage(getBPStatus(currentVitals.bloodPressureSystolic, currentVitals.bloodPressureDiastolic))
    },
    { 
      name: "Heart Rate", 
      val: currentVitals.heartRate, 
      unit: "bpm", 
      status: getHRStatus(currentVitals.heartRate),
      msg: getHRMessage(getHRStatus(currentVitals.heartRate))
    },
    { 
      name: "SpO2 Oxygen", 
      val: currentVitals.oxygenSaturation, 
      unit: "%", 
      status: getSpO2Status(currentVitals.oxygenSaturation),
      msg: getSpO2Message(getSpO2Status(currentVitals.oxygenSaturation))
    },
    { 
      name: "Body Temp", 
      val: currentVitals.temperature, 
      unit: "°C", 
      status: getTempStatus(currentVitals.temperature),
      msg: getTempMessage(getTempStatus(currentVitals.temperature))
    },
    { 
      name: "Blood Glucose", 
      val: currentVitals.bloodGlucose, 
      unit: "mmol/L", 
      status: getGlucoseStatus(currentVitals.bloodGlucose),
      msg: getGlucoseMessage(getGlucoseStatus(currentVitals.bloodGlucose))
    },
    { 
      name: "BMI", 
      val: autoBMI, 
      unit: "kg/m²", 
      status: getBMIStatus(autoBMI),
      msg: getBMIMessage(getBMIStatus(autoBMI))
    }
  ].filter(r => r.val !== undefined && r.val !== null);

  return (
    <div className="min-h-screen bg-background flex flex-col pb-40">
      <KioskHeader title="Session Results" showBack backTo={`/session/${sessionId}`} />

      <main className="flex-1 p-8 max-w-5xl mx-auto w-full">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center w-24 h-24 bg-success/20 text-success rounded-full mb-6">
            <CheckCircle className="w-12 h-12" />
          </div>
          <h2 className="text-5xl font-display font-bold text-foreground">Session Complete</h2>
          <p className="text-2xl text-muted-foreground mt-4">Review the summary below for {session.patientName}</p>
        </div>

        <div className="bg-card rounded-[2rem] shadow-xl border border-border overflow-hidden">
          <div className="divide-y divide-border/50">
            {resultsList.length === 0 ? (
              <div className="p-12 text-center text-2xl text-muted-foreground">No vitals recorded in this session.</div>
            ) : (
              resultsList.map((item, idx) => (
                <div key={idx} className="p-8 flex items-center justify-between">
                  <div className="flex-1">
                    <h4 className="text-2xl font-bold text-foreground mb-2">{item.name}</h4>
                    <p className={`text-lg font-medium ${item.status === 'normal' ? 'text-muted-foreground' : 'text-foreground'}`}>
                      {item.msg}
                    </p>
                  </div>
                  
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <span className="text-5xl font-display font-bold tracking-tight">{item.val}</span>
                      <span className="text-xl text-muted-foreground ml-2">{item.unit}</span>
                    </div>
                    <div className={`w-4 h-24 rounded-full ${getStatusColor(item.status).split(' ')[0]}`} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-[0_-8px_30px_rgba(0,0,0,0.05)] p-6 z-10">
        <div className="max-w-5xl mx-auto flex gap-6">
          <button
            onClick={() => alert("Print functionality simulated.")}
            className="flex-1 h-24 bg-secondary text-secondary-foreground text-3xl font-display font-bold rounded-2xl active:scale-95 transition-all flex items-center justify-center gap-4"
          >
            <Printer className="w-10 h-10" />
            Print Report
          </button>
          
          <button
            onClick={() => setLocation("/")}
            className="flex-[2] h-24 bg-primary text-primary-foreground text-3xl font-display font-bold rounded-2xl shadow-xl shadow-primary/25 active:scale-95 transition-all flex items-center justify-center gap-4"
          >
            <Home className="w-10 h-10" />
            Done & Return Home
          </button>
        </div>
      </div>
    </div>
  );
}

// Helper messaging functions for display
function getBPMessage(s: VitalStatus) {
  if (s === 'normal') return "Blood pressure is in the healthy range.";
  if (s === 'warning') return "Elevated blood pressure detected. Monitor closely.";
  if (s === 'critical') return "High blood pressure detected. Consult a physician.";
  return "Insufficient data.";
}
function getHRMessage(s: VitalStatus) {
  if (s === 'normal') return "Heart resting rate is normal.";
  if (s === 'warning') return "Heart rate is slightly outside normal range.";
  if (s === 'critical') return "Abnormal heart rate detected.";
  return "Insufficient data.";
}
function getSpO2Message(s: VitalStatus) {
  if (s === 'normal') return "Healthy blood oxygen levels.";
  if (s === 'warning') return "Slightly low oxygen saturation.";
  if (s === 'critical') return "Critical: Low oxygen levels detected.";
  return "Insufficient data.";
}
function getTempMessage(s: VitalStatus) {
  if (s === 'normal') return "Body temperature is normal.";
  if (s === 'warning') return "Slight variance in body temperature.";
  if (s === 'critical') return "Fever or severe temperature variance detected.";
  return "Insufficient data.";
}
function getGlucoseMessage(s: VitalStatus) {
  if (s === 'normal') return "Blood glucose is within target range.";
  if (s === 'warning') return "Borderline blood glucose levels.";
  if (s === 'critical') return "High or very low glucose detected.";
  return "Insufficient data.";
}
function getBMIMessage(s: VitalStatus) {
  if (s === 'normal') return "Healthy weight range.";
  if (s === 'warning') return "Outside of standard healthy weight range.";
  if (s === 'critical') return "Indicates obesity risk category.";
  return "Insufficient data.";
}
