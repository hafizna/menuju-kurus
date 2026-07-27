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
- weekly summary;
- Fitness Intelligence recap;
- Nutrition/Satiety recap.

`GEMINI_MODEL` is optional. A stale configured model will be attempted first and then skipped when Google returns the model-unavailable response.
