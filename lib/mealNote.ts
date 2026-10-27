// A short free-text note about a meal ("telur 3 butir") that is given to the AI
// as a fact about that meal. It travels to the model inside a quoted string, so
// it is cleaned and capped first.

export const MAX_MEAL_NOTE_LENGTH = 200;

/** Trimmed, single-spaced text without control characters, at most 200 characters. */
export function cleanNote(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_MEAL_NOTE_LENGTH)
    .trim();
}
