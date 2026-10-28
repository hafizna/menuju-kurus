/**
 * The household measures that "Tulis & hitung" works from. A unit means the
 * same amount for everyone, so a count written by a man or a woman is turned
 * into the same grams and calories; each person's own target is what differs.
 * The AI prompt and the help on the screen both read this one list.
 */
export interface PortionUnit {
  food: string;
  /** What the person writes. */
  unit: string;
  /** What it stands for. */
  size: string;
  /** A ready phrase for the quick-add chips. */
  phrase: string;
}

export const PORTION_UNITS: readonly PortionUnit[] = [
  { food: "Nasi putih", unit: "1 centong", size: "100 g matang", phrase: "nasi 1 centong" },
  { food: "Telur", unit: "1 butir", size: "50 g (telur ayam sedang)", phrase: "telur 1 butir" },
  { food: "Ayam goreng", unit: "1 potong", size: "paha atau dada, ±100 g tanpa tulang", phrase: "ayam goreng 1 potong" },
  { food: "Tempe atau tahu", unit: "1 potong", size: "±30 g", phrase: "tempe 2 potong" },
  { food: "Sayur berkuah", unit: "1 mangkuk kecil", size: "±200 ml", phrase: "sayur bening 1 mangkuk kecil" },
  { food: "Minuman", unit: "1 gelas", size: "240 ml", phrase: "teh manis 1 gelas" },
  { food: "Gula, minyak, sambal", unit: "1 sendok makan", size: "±15 g", phrase: "sambal 1 sendok makan" },
];

/** The same list as plain lines, for the AI prompt. */
export function portionUnitLines(): string {
  return PORTION_UNITS.map((unit) => `- ${unit.food}: ${unit.unit} = ${unit.size}`).join("\n");
}
