type GeminiTextPart = { text: string };
type GeminiInlineDataPart = { inline_data: { mime_type: string; data: string } };
export type GeminiPart = GeminiTextPart | GeminiInlineDataPart;

interface GenerateJsonOptions {
  parts: GeminiPart[];
  responseSchema: Record<string, unknown>;
  emptyResponseMessage: string;
}

const DEFAULT_MODELS = ["gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-flash"];

function candidateModels(): string[] {
  const configured = process.env.GEMINI_MODEL?.trim();
  return [...new Set([configured, ...DEFAULT_MODELS].filter((value): value is string => Boolean(value)))];
}

function isUnavailableModel(status: number, body: string): boolean {
  if (status !== 400 && status !== 404) return false;
  const normalized = body.toLowerCase();
  return normalized.includes("model") && (
    normalized.includes("not found") ||
    normalized.includes("no longer available") ||
    normalized.includes("not supported")
  );
}

export async function generateGeminiJson<T>(options: GenerateJsonOptions): Promise<T> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY env var is not set");

  const attempted: string[] = [];
  let lastError = "";

  for (const model of candidateModels()) {
    attempted.push(model);
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: options.parts }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: options.responseSchema,
          },
        }),
      }
    );

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      lastError = `Gemini API error ${res.status} on ${model}: ${body.slice(0, 280)}`;
      if (isUnavailableModel(res.status, body)) continue;
      throw new Error(lastError);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error(options.emptyResponseMessage);

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(`Gemini returned invalid JSON using ${model}`);
    }
  }

  throw new Error(`${lastError || "No compatible Gemini model was available"}. Tried: ${attempted.join(", ")}`);
}
