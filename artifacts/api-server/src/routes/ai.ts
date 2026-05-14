import { Router, type IRouter } from "express";
import print from "./print";

const router: IRouter = Router();

const OLLAMA_HOST = process.env.OLLAMA_HOST || "http://localhost:11434";
const OLLAMA_MODEL = "qwen2.5:0.5b";
console.log(`Using Ollama at ${OLLAMA_HOST} with model ${OLLAMA_MODEL}`);

router.post("/ai/recommendation", async (req, res) => {
  const { vitals } = req.body;

  if (!vitals) {
    res.status(400).json({ error: "vitals required" });
    return;
  }

  const prompt_message = `You are a health assistant. Based on the following vital signs, provide a brief health recommendation in 2-3 sentences. Keep it clear and actionable.

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
        stream: true,
        options: { temperature: 0.3, num_predict: 100 },
      }),
    });
    console.log("Requesting Ollama with prompt:", prompt_message);

    if (!response.ok) {
      throw new Error(`Ollama returned ${response.status}`);
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");

    req.socket.setNoDelay(true);
    res.flushHeaders();

    const reader = response.body?.getReader();
    if (!reader) {
      res.write(
        `data: ${JSON.stringify({ error: "No response stream", done: true })}\n\n`,
      );
      res.end();
      return;
    }

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const data = JSON.parse(line);
          if (data.response) {
            res.write(`data: ${JSON.stringify({ chunk: data.response })}\n\n`);
          }
          if (data.done) {
            res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
          }
        } catch {
          // skip malformed lines
        }
      }
    }

    res.end();
  } catch (e) {
    console.error("Ollama error:", e);
    res.write(`data: ${JSON.stringify({ error: "Ollama unavailable" })}\n\n`);
    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.end();
  }
});

export default router;
