import { Router, type IRouter } from "express";
import print from "./print";

const router: IRouter = Router();

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "tinyllama";
console.log(`Using Ollama at ${OLLAMA_HOST} with model ${OLLAMA_MODEL}`);

router.post("/ai/recommendation", async (req, res) => {
  const { vitals } = req.body;

  if (!vitals) {
    res.status(400).json({ error: "vitals required" });
    return;
  }

  const prompt = `You are a health assistant. Based on the following vital signs, provide a brief health assessment and recommendation in 3-4 sentences. Keep it clear and actionable.

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
        prompt,
        stream: false,
        options: { temperature: 0.3, num_predict: 100 },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    const data = (await response.json()) as { response: string };
    res.json({ recommendation: data.response.trim() });
  } catch (e) {
    console.error("Ollama error:", e);
    res.json({ recommendation: null, error: "Ollama unavailable" });
  }
});

export default router;
