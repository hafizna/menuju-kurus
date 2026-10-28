// Short free text about a meal that is given to the AI as a fact about that
// meal: a note on a photo ("telur 3 butir") or the whole description of a meal
// that has no photo. It travels to the model inside a quoted string, so it is
// cleaned and capped first.

export const MAX_MEAL_NOTE_LENGTH = 200;
export const MAX_MEAL_DESCRIPTION_LENGTH = 400;

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
}

/** Trimmed, single-spaced text without control characters, at most 200 characters. */
export function cleanNote(value: unknown): string {
  return cleanText(value, MAX_MEAL_NOTE_LENGTH);
}

/** The same cleaning for a written description of a whole meal, at most 400 characters. */
export function cleanDescription(value: unknown): string {
  return cleanText(value, MAX_MEAL_DESCRIPTION_LENGTH);
}
