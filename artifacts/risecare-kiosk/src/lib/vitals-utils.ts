export type VitalStatus = 'normal' | 'warning' | 'critical' | 'unknown';

export function getBPStatus(sys?: number | null, dia?: number | null): VitalStatus {
  if (!sys || !dia) return 'unknown';
  if (sys < 120 && dia < 80) return 'normal';
  if ((sys >= 120 && sys <= 129) && dia < 80) return 'warning'; // Elevated
  if (sys >= 130 || dia >= 80) return 'critical'; // High BP
  return 'unknown';
}

export function getHRStatus(hr?: number | null): VitalStatus {
  if (!hr) return 'unknown';
  if (hr >= 60 && hr <= 100) return 'normal';
  if (hr >= 50 && hr < 60) return 'warning';
  if (hr > 100 && hr <= 110) return 'warning';
  return 'critical';
}

export function getSpO2Status(spo2?: number | null): VitalStatus {
  if (!spo2) return 'unknown';
  if (spo2 >= 95) return 'normal';
  if (spo2 >= 90) return 'warning';
  return 'critical';
}

export function getTempStatus(temp?: number | null): VitalStatus {
  if (!temp) return 'unknown';
  if (temp >= 36.1 && temp <= 37.2) return 'normal';
  if ((temp >= 35.5 && temp < 36.1) || (temp > 37.2 && temp <= 38.0)) return 'warning';
  return 'critical';
}

export function calculateBMI(weight?: number | null, height?: number | null): number | null {
  if (!weight || !height) return null;
  const heightM = height / 100;
  return Number((weight / (heightM * heightM)).toFixed(1));
}

export function getBMIStatus(bmi?: number | null): VitalStatus {
  if (!bmi) return 'unknown';
  if (bmi >= 18.5 && bmi < 25) return 'normal';
  if (bmi >= 25 && bmi < 30) return 'warning'; // Overweight
  if (bmi < 18.5) return 'warning'; // Underweight
  return 'critical'; // Obese
}

export function getStatusColor(status: VitalStatus): string {
  switch (status) {
    case 'normal': return 'bg-success text-success-foreground';
    case 'warning': return 'bg-warning text-warning-foreground';
    case 'critical': return 'bg-destructive text-destructive-foreground';
    default: return 'bg-muted text-muted-foreground';
  }
}

export function getStatusText(status: VitalStatus): string {
  switch (status) {
    case 'normal': return 'Normal';
    case 'warning': return 'Attention';
    case 'critical': return 'Critical';
    default: return 'Pending';
  }
}
