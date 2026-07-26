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

export function challengeForDate(dateKey: string): Challenge {
  let hash = 0;
  for (let i = 0; i < dateKey.length; i++) {
    hash = (hash * 31 + dateKey.charCodeAt(i)) >>> 0;
  }
  return CHALLENGES[hash % CHALLENGES.length];
}
