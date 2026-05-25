import { Router, type IRouter } from "express";
import { query } from "@workspace/db";

const router: IRouter = Router();

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = "qwen2.5:0.5b";

// Thresholds aligned with frontend vitals-utils.ts
const THRESHOLDS = {
  bp: { normalSys: 120, normalDia: 80, warningSys: 130, warningDia: 80, criticalSys: 130, criticalDia: 80 },
  hr: { normalMin: 60, normalMax: 100, warningMin: 50, warningMax: 110 },
  spo2: { normal: 95, warning: 90 },
  temp: { normalMin: 36.1, normalMax: 37.2, warningMin: 35.5, warningMax: 38 },
  bmi: { normalMin: 18.5, normalMax: 25, warningMin: 25, warningMax: 30, critical: 30 },
} as const;

type VitalStatus = "normal" | "warning" | "critical" | "unknown";

function getBPStatus(sys?: number, dia?: number): VitalStatus {
  if (!sys || !dia) return "unknown";
  if (sys < 120 && dia < 80) return "normal";
  if (sys >= 120 && sys <= 129 && dia < 80) return "warning";
  return "critical";
}

function getHRStatus(hr?: number): VitalStatus {
  if (!hr) return "unknown";
  if (hr >= 60 && hr <= 100) return "normal";
  if ((hr >= 50 && hr < 60) || (hr > 100 && hr <= 110)) return "warning";
  return "critical";
}

function getSpO2Status(spo2?: number): VitalStatus {
  if (!spo2) return "unknown";
  if (spo2 >= 95) return "normal";
  if (spo2 >= 90) return "warning";
  return "critical";
}

function getTempStatus(temp?: number): VitalStatus {
  if (!temp) return "unknown";
  if (temp >= 36.1 && temp <= 37.2) return "normal";
  if ((temp >= 35.5 && temp < 36.1) || (temp > 37.2 && temp <= 38.0)) return "warning";
  return "critical";
}

function getBMIStatus(bmi?: number): VitalStatus {
  if (!bmi) return "unknown";
  if (bmi >= 18.5 && bmi < 25) return "normal";
  if ((bmi >= 25 && bmi < 30) || bmi < 18.5) return "warning";
  return "critical";
}

function calculateBMI(weight?: number, height?: number): number | null {
  if (!weight || !height) return null;
  const heightM = height / 100;
  return Number((weight / (heightM * heightM)).toFixed(1));
}

function ruleBasedRecommendation(vitals: Record<string, any>): string {
  const sys = vitals.bloodPressureSystolic ? Number(vitals.bloodPressureSystolic) : undefined;
  const dia = vitals.bloodPressureDiastolic ? Number(vitals.bloodPressureDiastolic) : undefined;
  const hr = vitals.heartRate ? Number(vitals.heartRate) : undefined;
  const spo2 = vitals.oxygenSaturation ? Number(vitals.oxygenSaturation) : undefined;
  const temp = vitals.temperature ? Number(vitals.temperature) : undefined;
  const weight = vitals.weight ? Number(vitals.weight) : undefined;
  const height = vitals.height ? Number(vitals.height) : undefined;

  const bpStatus = getBPStatus(sys, dia);
  const hrStatus = getHRStatus(hr);
  const spo2Status = getSpO2Status(spo2);
  const tempStatus = getTempStatus(temp);
  const bmi = calculateBMI(weight, height);
  const bmiStatus = bmi !== null ? getBMIStatus(bmi) : "unknown";

  const criticals: string[] = [];
  const warnings: string[] = [];
  const normals: string[] = [];

  if (bpStatus === "critical") {
    criticals.push(`Blood pressure is high at ${sys}/${dia} mmHg. Consult a physician promptly.`);
  } else if (bpStatus === "warning") {
    warnings.push(`Blood pressure is elevated at ${sys}/${dia} mmHg. Monitor closely and reduce sodium intake.`);
  } else if (bpStatus === "normal") {
    normals.push("Blood pressure is in the healthy range.");
  }

  if (hrStatus === "critical") {
    criticals.push(`Heart rate is ${hr} bpm — outside normal range. Seek medical evaluation.`);
  } else if (hrStatus === "warning") {
    warnings.push(`Heart rate is ${hr} bpm — slightly outside the normal range. Rest and check again.`);
  } else if (hrStatus === "normal") {
    normals.push("Heart rate is normal.");
  }

  if (spo2Status === "critical") {
    criticals.push(`Oxygen saturation is ${spo2}% — critically low. Seek immediate medical attention.`);
  } else if (spo2Status === "warning") {
    warnings.push(`Oxygen saturation is ${spo2}% — below normal. Get fresh air and consult a doctor if persistent.`);
  } else if (spo2Status === "normal") {
    normals.push("Oxygen saturation is at a healthy level.");
  }

  if (tempStatus === "critical") {
    if (temp != null && temp < 35) {
      criticals.push(`Body temperature is ${temp}°C — possible hypothermia. Seek warmth and medical help.`);
    } else {
      criticals.push(`Body temperature is ${temp}°C — fever detected. Rest, hydrate, and take fever medication if needed.`);
    }
  } else if (tempStatus === "warning") {
    warnings.push(`Body temperature is ${temp}°C — slightly outside normal range. Stay hydrated.`);
  } else if (tempStatus === "normal") {
    normals.push("Body temperature is normal.");
  }

  if (bmiStatus === "critical") {
    warnings.push(`BMI is ${bmi} — indicates obesity. A balanced diet and regular exercise are recommended.`);
  } else if (bmiStatus === "warning") {
    if (bmi != null && bmi < 18.5) {
      warnings.push(`BMI is ${bmi} — underweight. Consider nutritional counseling.`);
    } else {
      warnings.push(`BMI is ${bmi} — above the healthy range. Moderate exercise and portion control can help.`);
    }
  } else if (bmiStatus === "normal") {
    normals.push("BMI is within a healthy range.");
  }

  // Combined assessment
  const combined: string[] = [];
  if (bpStatus === "critical" && hrStatus === "critical") {
    combined.push("Elevated blood pressure combined with abnormal heart rate may indicate stress or an underlying condition — consult a doctor.");
  } else if (bpStatus === "warning" && hrStatus === "warning") {
    combined.push("Both blood pressure and heart rate are slightly elevated. Try deep breathing and resting before rechecking.");
  }
  if (spo2Status === "warning" && hrStatus === "warning") {
    combined.push("Low oxygen with elevated heart rate may indicate respiratory strain — rest in a well-ventilated area.");
  }

  const parts: string[] = [];

  if (criticals.length > 0) {
    parts.push("⚠️ Urgent: " + criticals.join(" "));
  }
  if (warnings.length > 0) {
    parts.push("⚠ " + warnings.join(" "));
  }
  if (combined.length > 0) {
    parts.push(combined.join(" "));
  }
  if (normals.length > 0) {
    parts.push("✔ " + normals.join(" "));
  }

  if (parts.length === 0) {
    return "No significant vital signs detected. Ensure all sensors are properly connected.";
  }

  const urgentCount = criticals.length;
  if (urgentCount > 1) {
    parts.push("Multiple critical readings detected. Please seek immediate medical attention.");
  } else if (urgentCount === 1) {
    parts.push("One or more readings require medical attention. Please consult a healthcare provider.");
  } else if (warnings.length > 0) {
    parts.push("Overall, your vitals show some deviations from normal. Monitor and recheck regularly.");
  } else {
    parts.push("All vitals are within normal ranges. Keep up your healthy habits!");
  }

  return parts.join("\n\n");
}

async function getAiMode(): Promise<string> {
  try {
    const rows = await query("SELECT value FROM settings WHERE key = 'ai_mode'");
    return (rows && rows.length > 0) ? rows[0].value : "integrated";
  } catch {
    return "integrated";
  }
}

router.post("/ai/recommendation", async (req, res) => {
  const { vitals } = req.body;

  if (!vitals) {
    res.status(400).json({ error: "vitals required" });
    return;
  }

  const mode = await getAiMode();

  if (mode === "rule-based") {
    const recommendation = ruleBasedRecommendation(vitals);
    res.json({ recommendation });
    return;
  }

  // Integrated AI — call Ollama
  const prompt_message = `You are a health assistant. Based on the following vital signs, provide a brief health assessment and recommendation in 2-3 sentences. Keep it clear and actionable.

Patient Vitals:
${Object.entries(vitals)
  .filter(([, v]) => v != null)
  .map(([key, val]) => `- ${key}: ${val}`)
  .join("\n")}

Assessment:`;

  try {
    const response = await fetch(`${OLLAMA_HOST}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: OLLAMA_MODEL,
        prompt: prompt_message,
        stream: false,
        options: { temperature: 0.3, num_predict: 200 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const data = await response.json();
    const recommendation = data.response || "";
    res.json({ recommendation });
  } catch (e) {
    console.error("Ollama error:", e);
    res.json({ recommendation: "", error: "Ollama unavailable" });
  }
});

export default router;
