import { generateDeepseekJson } from "./deepseekClient";
import { generateGeminiJson } from "./geminiClient";

// Text-only AI calls (weekly summary, fitness recap, satiety recap) share one
// entry point. Gemini comes first because its free tier needs no credit and its
// key is already required for food photos; DeepSeek is prepaid, so it is only
// used when it is the sole key or when TEXT_AI_PROVIDER=deepseek asks for it.
// With no key at all, callers fall back to their deterministic templates.
export type TextAiProvider = "gemini" | "deepseek";

export function textAiProvider(): TextAiProvider | null {
  const hasGemini = Boolean(process.env.GEMINI_API_KEY?.trim());
  const hasDeepseek = Boolean(process.env.DEEPSEEK_API_KEY?.trim());
  const preferred = process.env.TEXT_AI_PROVIDER?.trim().toLowerCase();
  if (preferred === "deepseek" && hasDeepseek) return "deepseek";
  if (preferred === "gemini" && hasGemini) return "gemini";
  if (hasGemini) return "gemini";
  if (hasDeepseek) return "deepseek";
  return null;
}

interface GenerateTextJsonOptions {
  systemPrompt: string;
  userContent: string;
  // DeepSeek only guarantees valid JSON, so it needs the shape spelled out.
  jsonShapeHint: string;
  // Gemini enforces the shape through a response schema.
  responseSchema: Record<string, unknown>;
  emptyResponseMessage: string;
}

export function generateTextJson<T>(options: GenerateTextJsonOptions): Promise<T> {
  const provider = textAiProvider();
  if (provider === "gemini") {
    return generateGeminiJson<T>({
      systemInstruction: options.systemPrompt,
      parts: [{ text: options.userContent }],
      responseSchema: options.responseSchema,
      emptyResponseMessage: options.emptyResponseMessage,
      temperature: 0.3,
    });
  }
  if (provider === "deepseek") {
    return generateDeepseekJson<T>({
      systemPrompt: options.systemPrompt,
      userContent: options.userContent,
      jsonShapeHint: options.jsonShapeHint,
      emptyResponseMessage: options.emptyResponseMessage,
    });
  }
  return Promise.reject(new Error("No text AI provider is configured"));
}

export const SUMMARY_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    recommendations: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["summary", "recommendations"],
};

export const SATIETY_RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    summary: { type: "STRING" },
    suggestions: { type: "ARRAY", items: { type: "STRING" } },
  },
  required: ["summary", "suggestions"],
};
