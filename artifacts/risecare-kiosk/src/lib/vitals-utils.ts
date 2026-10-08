export type VitalStatus = 'normal' | 'warning' | 'critical' | 'unknown';

export function getBPStatus(sys?: number | null, dia?: number | null): VitalStatus {
  if (
    sys == null ||
    dia == null ||
    !Number.isFinite(sys) ||
    !Number.isFinite(dia) ||
    sys <= dia ||
    sys > 300 ||
    dia < 20 ||
    dia > 200
  ) return 'unknown';
  if (sys >= 180 || dia >= 120) return 'critical';
  if (sys < 90 || dia < 60) return 'warning';
  if (sys < 120 && dia < 80) return 'normal';
  return 'warning';
}

export function getHRStatus(hr?: number | null): VitalStatus {
  if (hr == null || !Number.isFinite(hr) || hr <= 0 || hr > 300) return 'unknown';
  if (hr >= 60 && hr <= 100) return 'normal';
  if (hr < 40 || hr >= 150) return 'critical';
  return 'warning';
}

export function getSpO2Status(spo2?: number | null): VitalStatus {
  if (spo2 == null || !Number.isFinite(spo2) || spo2 <= 0 || spo2 > 100) return 'unknown';
  if (spo2 >= 95) return 'normal';
  if (spo2 <= 90) return 'critical';
  return 'warning';
}

export function getTempStatus(temp?: number | null): VitalStatus {
  if (temp == null || !Number.isFinite(temp) || temp < 20 || temp > 50) return 'unknown';
  if (temp < 35 || temp >= 40) return 'critical';
  if (temp < 36 || temp >= 38) return 'warning';
  return 'normal';
}

export function calculateBMI(weight?: number | null, height?: number | null): number | null {
  if (
    weight == null ||
    height == null ||
    !Number.isFinite(weight) ||
    !Number.isFinite(height) ||
    weight <= 0 ||
    height <= 0
  ) return null;
  const heightM = height / 100;
  return Number((weight / (heightM * heightM)).toFixed(1));
}

export function getBMIStatus(bmi?: number | null): VitalStatus {
  if (bmi == null || !Number.isFinite(bmi) || bmi <= 0 || bmi > 100) return 'unknown';
  if (bmi >= 18.5 && bmi < 25) return 'normal';
  return 'warning';
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
    case 'warning': return 'Warning';
    case 'critical': return 'Critical';
    default: return 'Not assessed';
  }
}
