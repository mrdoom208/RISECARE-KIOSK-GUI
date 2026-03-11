import { useState, useMemo } from "react";
import { useRoute, useLocation } from "wouter";
import { useGetSession, useSaveVitals } from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Heart, Activity, Thermometer, Droplet, Scale, Ruler, Wind, CheckCircle2 } from "lucide-react";
import { KioskHeader } from "@/components/KioskHeader";
import { VitalCard } from "@/components/VitalCard";
import { KeypadDialog } from "@/components/KeypadDialog";
import { getBPStatus, getHRStatus, getSpO2Status, getTempStatus, getGlucoseStatus, getBMIStatus, calculateBMI } from "@/lib/vitals-utils";

type VitalType = 'bp' | 'hr' | 'spo2' | 'temp' | 'weight' | 'height' | 'glucose';

export default function Dashboard() {
  const [, params] = useRoute("/session/:id");
  const [, setLocation] = useLocation();
  const sessionId = parseInt(params?.id || "0", 10);
  const queryClient = useQueryClient();

  const { data: session, isLoading } = useGetSession(sessionId);
  const saveVitalsMutation = useSaveVitals();

  const [activeKeypad, setActiveKeypad] = useState<VitalType | null>(null);

  // Aggregate the latest vital readings for the UI
  const currentVitals = useMemo(() => {
    if (!session?.vitals) return {};
    return session.vitals.reduce((acc, curr) => ({ ...acc, ...curr }), {});
  }, [session]);

  const autoBMI = calculateBMI(currentVitals.weight, currentVitals.height);

  const handleSaveVital = (val1: string, val2?: string) => {
    if (!activeKeypad) return;

    const num1 = val1 ? parseFloat(val1) : null;
    const num2 = val2 ? parseFloat(val2) : null;

    const payload: any = {};
    if (activeKeypad === 'bp') {
      payload.bloodPressureSystolic = num1;
      payload.bloodPressureDiastolic = num2;
    } else if (activeKeypad === 'hr') payload.heartRate = num1;
    else if (activeKeypad === 'spo2') payload.oxygenSaturation = num1;
    else if (activeKeypad === 'temp') payload.temperature = num1;
    else if (activeKeypad === 'weight') payload.weight = num1;
    else if (activeKeypad === 'height') payload.height = num1;
    else if (activeKeypad === 'glucose') payload.bloodGlucose = num1;

    saveVitalsMutation.mutate(
      { id: sessionId, data: payload },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: [`/api/sessions/${sessionId}`] });
          setActiveKeypad(null);
        }
      }
    );
  };

  const getDialogConfig = () => {
    switch (activeKeypad) {
      case 'bp': return { title: "Blood Pressure", unit: "mmHg", isDouble: true };
      case 'hr': return { title: "Heart Rate", unit: "bpm" };
      case 'spo2': return { title: "SpO2 (Oxygen)", unit: "%" };
      case 'temp': return { title: "Body Temperature", unit: "°C" };
      case 'weight': return { title: "Weight", unit: "kg" };
      case 'height': return { title: "Height", unit: "cm" };
      case 'glucose': return { title: "Blood Glucose", unit: "mmol/L" };
      default: return { title: "", unit: "" };
    }
  };

  if (isLoading) return <div className="p-12 text-center text-2xl font-bold text-muted-foreground min-h-screen bg-background pt-32">Loading session...</div>;
  if (!session) return <div className="p-12 text-center text-2xl text-destructive font-bold pt-32">Session not found</div>;

  return (
    <div className="min-h-screen bg-background flex flex-col pb-32">
      <KioskHeader title={`Recording: ${session.patientName}`} showBack backTo="/" />

      <main className="flex-1 p-8 max-w-[1600px] mx-auto w-full">
        <div className="flex justify-between items-end mb-8">
          <div>
            <h2 className="text-4xl font-display font-bold text-foreground">Vital Signs</h2>
            <p className="text-xl text-muted-foreground mt-2">Tap any card to record a measurement.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          <VitalCard
            title="Blood Pressure"
            value={currentVitals.bloodPressureSystolic}
            secondaryValue={currentVitals.bloodPressureDiastolic}
            unit="mmHg"
            icon={<Heart className="w-10 h-10" />}
            status={getBPStatus(currentVitals.bloodPressureSystolic, currentVitals.bloodPressureDiastolic)}
            onClick={() => setActiveKeypad('bp')}
            isDouble
          />
          <VitalCard
            title="Heart Rate"
            value={currentVitals.heartRate}
            unit="bpm"
            icon={<Activity className="w-10 h-10" />}
            status={getHRStatus(currentVitals.heartRate)}
            onClick={() => setActiveKeypad('hr')}
          />
          <VitalCard
            title="SpO2"
            value={currentVitals.oxygenSaturation}
            unit="%"
            icon={<Wind className="w-10 h-10" />}
            status={getSpO2Status(currentVitals.oxygenSaturation)}
            onClick={() => setActiveKeypad('spo2')}
          />
          <VitalCard
            title="Temperature"
            value={currentVitals.temperature}
            unit="°C"
            icon={<Thermometer className="w-10 h-10" />}
            status={getTempStatus(currentVitals.temperature)}
            onClick={() => setActiveKeypad('temp')}
          />
          <VitalCard
            title="Blood Glucose"
            value={currentVitals.bloodGlucose}
            unit="mmol/L"
            icon={<Droplet className="w-10 h-10" />}
            status={getGlucoseStatus(currentVitals.bloodGlucose)}
            onClick={() => setActiveKeypad('glucose')}
          />
          <VitalCard
            title="Weight"
            value={currentVitals.weight}
            unit="kg"
            icon={<Scale className="w-10 h-10" />}
            status="unknown"
            onClick={() => setActiveKeypad('weight')}
          />
          <VitalCard
            title="Height"
            value={currentVitals.height}
            unit="cm"
            icon={<Ruler className="w-10 h-10" />}
            status="unknown"
            onClick={() => setActiveKeypad('height')}
          />
          
          {/* Auto-calculated BMI */}
          <div className="relative overflow-hidden bg-secondary/30 rounded-3xl p-6 border-2 border-border/50 flex flex-col justify-between">
            <div className="flex justify-between items-start mb-6">
              <h3 className="text-2xl font-bold text-foreground">BMI (Auto)</h3>
              {autoBMI && (
                <div className={`px-4 py-2 rounded-full text-sm font-bold tracking-wide uppercase ${getStatusColor(getBMIStatus(autoBMI))}`}>
                  {getStatusText(getBMIStatus(autoBMI))}
                </div>
              )}
            </div>
            <div>
              {autoBMI ? (
                <div className="flex items-baseline gap-2">
                  <span className="text-6xl font-display font-bold text-foreground">{autoBMI}</span>
                  <span className="text-2xl text-muted-foreground font-medium">kg/m²</span>
                </div>
              ) : (
                <div className="text-xl text-muted-foreground/80 font-medium pb-2">
                  Enter weight and height
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Fixed bottom action bar for Kiosk */}
      <div className="fixed bottom-0 left-0 right-0 bg-card border-t border-border shadow-[0_-8px_30px_rgba(0,0,0,0.05)] p-6 z-10 flex justify-center">
        <button
          onClick={() => setLocation(`/session/${sessionId}/results`)}
          className="w-full max-w-3xl h-24 bg-primary hover:bg-primary/90 text-primary-foreground text-3xl font-display font-bold rounded-2xl shadow-xl shadow-primary/25 active:scale-95 transition-all flex items-center justify-center gap-4"
        >
          <CheckCircle2 className="w-10 h-10" />
          Finish & View Results
        </button>
      </div>

      <KeypadDialog
        isOpen={activeKeypad !== null}
        onClose={() => setActiveKeypad(null)}
        onSave={handleSaveVital}
        {...getDialogConfig()}
      />
    </div>
  );
}
