// Shared client for DeepSeek's OpenAI-compatible Chat Completions API.
// Used only for text-only AI calls (weekly summary, fitness recap, satiety
// recap) — DeepSeek has no public vision model, so food photo analysis
// (lib/gemini.ts) stays on Gemini regardless of this client.
//
// Unlike Gemini's `responseSchema`, DeepSeek's `json_object` response format
// only guarantees syntactically valid JSON, not a specific shape — so callers
// must describe the exact keys/types in `jsonShapeHint`, which this client
// appends to the system prompt as an explicit instruction.

interface GenerateJsonOptions {
  systemPrompt: string;
  userContent: string;
  jsonShapeHint: string;
  emptyResponseMessage: string;
}

const DEFAULT_MODEL = "deepseek-chat";

export async function generateDeepseekJson<T>(options: GenerateJsonOptions): Promise<T> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DEEPSEEK_API_KEY env var is not set");
  const model = process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;

  const systemPrompt = `${options.systemPrompt}\n\nBalas HANYA dengan JSON valid (tanpa teks lain, tanpa markdown code fence), dengan struktur persis:\n${options.jsonShapeHint}`;

  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: options.userContent },
      ],
      response_format: { type: "json_object" },
      temperature: 0.3,
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`DeepSeek API error ${res.status}: ${body.slice(0, 280)}`);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(options.emptyResponseMessage);

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("DeepSeek returned invalid JSON");
  }
}
