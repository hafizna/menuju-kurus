export const WEEKLY_FOCUS_OPTIONS = [
  { id: "logging", label: "Catat makan dengan lengkap", detail: "Tutup catatan hari hanya setelah semua asupan tercatat.", href: "/makan", actionLabel: "Catat makan" },
  { id: "protein", label: "Perhatikan sumber protein", detail: "Coba sertakan sumber protein pada makan utama sesuai targetmu.", href: "/makan?mode=cari", actionLabel: "Cari ide makan" },
  { id: "baseline", label: "Bangun catatan tubuh", detail: "Jika berkenan, catat berat dengan kondisi pengukuran yang mirip.", href: "/progress?tab=body", actionLabel: "Catat ukuran tubuh" },
  { id: "rhythm", label: "Jaga ritme yang bisa diulang", detail: "Pilih satu rutinitas makan atau gerak yang terasa realistis minggu ini.", href: "/", actionLabel: "Lihat hari ini" },
] as const;

export type WeeklyFocusId = (typeof WEEKLY_FOCUS_OPTIONS)[number]["id"];
export interface WeeklyFocus {
  id: WeeklyFocusId;
  selectedOn: string;
  reviewOn: string;
  completedOn: string | null;
}
export function findWeeklyFocus(id: unknown) {
  return WEEKLY_FOCUS_OPTIONS.find((option) => option.id === id);
}
export function createWeeklyFocus(id: WeeklyFocusId, today: string): WeeklyFocus {
  const reviewOn = new Date(Date.parse(today) + 7 * 86400000).toISOString().slice(0, 10);
  return { id, selectedOn: today, reviewOn, completedOn: null };
}
