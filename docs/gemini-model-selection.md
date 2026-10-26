# Gemini model selection

All Gemini-powered features use `lib/geminiClient.ts`.

Model order:

1. `GEMINI_MODEL`, when explicitly configured.
2. `gemini-3.6-flash`.
3. `gemini-3.5-flash-lite`.
4. `gemini-2.5-flash`.

The client only falls back when Google reports that a model is missing, unsupported, or no longer available. Authentication, quota, safety, and malformed-request errors are returned immediately instead of being hidden by another model attempt.

The shared client is used by:

- food-photo analysis;
- weekly summary, Fitness Intelligence recap, and Nutrition/Satiety recap, through `lib/textAi.ts`.

`lib/textAi.ts` picks the provider for the three text-only features: Gemini when `GEMINI_API_KEY` is set (its free tier needs no credit), otherwise DeepSeek when `DEEPSEEK_API_KEY` is set, otherwise no provider and each feature returns its deterministic template. `TEXT_AI_PROVIDER=deepseek` (or `gemini`) forces a provider when both keys exist. Text calls use a system instruction and a response schema; DeepSeek still receives the JSON shape in its prompt.

Free-tier limits are per project and shown in the AI Studio console; Google does not publish fixed numbers. A rate-limited call fails and the route reports that the AI summary is unavailable, so the button can simply be tried again later. Google may use free-tier prompts to improve its products. The summaries contain body weight, body fat, heart-rate and VO₂ max figures but no name or account identifier; use a billed project if that is not acceptable.

`GEMINI_MODEL` is optional. A stale configured model will be attempted first and then skipped when Google returns the model-unavailable response.
