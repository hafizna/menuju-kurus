// Apple Health hands over 32-bit floats, so a body fat of 30.7 can arrive as
// 30.700000762939453. Measurements are kept and shown with at most two decimals.

/** Rounds to at most `decimals` places; anything that is not a finite number passes through. */
export function roundMeasure(value: number, decimals = 2): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/** Text for a measurement: at most two decimals and no trailing zeros ("30.7", "90.52", "93"). */
export function formatMeasure(value: number, decimals = 2): string {
  return String(roundMeasure(value, decimals));
}
