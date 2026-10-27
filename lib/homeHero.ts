export interface HomeHeroInput {
  /** The viewer's local hour in the profile timezone. */
  localHour: number;
  mealCount: number;
  foodLogComplete: boolean;
  /** No recorded history yet, so a welcome reads better than a status. */
  firstRun: boolean;
}

export interface HomeHeroCopy {
  headline: string;
  support: string;
}

const GENTLE = "Nggak perlu sempurna. Catat yang kamu ingat, pelan-pelan.";

/**
 * Headline and supporting line for the home greeting. They describe the state
 * of the log and the time of day, and never tell the viewer to postpone: the
 * mascot's own routine lives in mascotScene.ts and stays separate from this.
 */
export function buildHomeHero(input: HomeHeroInput): HomeHeroCopy {
  const { localHour, mealCount, foodLogComplete, firstRun } = input;
  const hasMeals = Number.isFinite(mealCount) && mealCount > 0;
  const validHour = Number.isFinite(localHour) && localHour >= 0 && localHour < 24;

  if (foodLogComplete) {
    return { headline: "Catatanmu sudah lengkap.", support: "Terima kasih sudah meluangkan waktu untuk dirimu." };
  }
  if (!hasMeals && firstRun) return { headline: "Mulai dari satu catatan.", support: GENTLE };

  // Matches the mascot's rest window, so the greeting and the scene agree.
  if (validHour && (localHour >= 22 || localHour < 5)) {
    return {
      headline: "Waktunya istirahat.",
      support: hasMeals
        ? "Catat yang masih teringat kalau mau, sisanya bisa besok."
        : "Belum ada catatan. Tidak apa-apa, besok bisa mulai lagi.",
    };
  }
  if (!hasMeals) {
    return validHour && localHour >= 18
      ? { headline: "Belum ada catatan hari ini.", support: "Satu catatan kecil sudah cukup." }
      : { headline: "Mulai dari satu catatan.", support: GENTLE };
  }
  if (validHour && localHour >= 18) {
    return {
      headline: "Hari ini hampir selesai.",
      support: "Ada makan, minum, atau camilan yang belum dicatat? Tambahkan, lalu tutup hari.",
    };
  }
  return { headline: "Hari ini masih berjalan.", support: GENTLE };
}
