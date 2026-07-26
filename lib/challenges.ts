export interface Challenge {
  id: string;
  label: string;
}

// Rotates deterministically by date so everyone (i.e. you) sees the same
// challenge all day without needing to store "today's pick" separately.
export const CHALLENGES: Challenge[] = [
  { id: "water-2l", label: "Minum air putih minimal 2 liter" },
  { id: "steps-6k", label: "Jalan kaki minimal 6.000 langkah" },
  { id: "no-sugar-drink", label: "Tanpa minuman manis / boba hari ini" },
  { id: "log-all-meals", label: "Catat semua makanan yang dimakan hari ini" },
  { id: "protein-first", label: "Makan sumber protein di setiap meal" },
  { id: "exercise-20", label: "Olahraga/cardio minimal 20 menit" },
  { id: "no-late-snack", label: "Tidak ngemil setelah jam 9 malam" },
  { id: "veggie-add", label: "Tambahkan sayur di minimal 2 meal" },
  { id: "stairs", label: "Pilih tangga daripada lift/eskalator" },
  { id: "sleep-early", label: "Tidur sebelum jam 11 malam" },
];

// userId is folded into the hash so two users see different challenges on
// the same day instead of always matching each other.
export function challengeForDate(dateKey: string, userId: string): Challenge {
  const key = `${dateKey}:${userId}`;
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return CHALLENGES[hash % CHALLENGES.length];
}
