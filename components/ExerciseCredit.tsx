"use client";

import { useEffect, useState } from "react";

interface Suggestion {
  activityId: string;
  label: string;
  minutes: number;
  distanceKm?: number;
}

export default function ExerciseCredit({ extraKcal }: { extraKcal: number }) {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);

  useEffect(() => {
    fetch(`/api/exercise-credit?extraKcal=${Math.round(extraKcal)}`)
      .then((r) => r.json())
      .then((d) => setSuggestions(d.suggestions ?? []));
  }, [extraKcal]);

  if (suggestions.length === 0) return null;

  return (
    <section className="rounded-2xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-900 dark:bg-sky-950/40">
      <div className="mb-1 text-sm font-medium text-sky-800 dark:text-sky-200">Pilihan aktivitas tambahan</div>
      <p className="mb-3 text-xs leading-relaxed text-sky-700 dark:text-sky-300">
        Kamu sekitar {Math.round(extraKcal)} kcal di atas target harian. Tidak wajib ditebus. Bila ingin mengalihkan craving,
        menjaga energi tetap seimbang, atau memang ingin bergerak, pilih salah satu aktivitas berikut.
      </p>
      <ul className="space-y-1 text-sm text-sky-900 dark:text-sky-100">
        {suggestions.map((s) => (
          <li key={s.activityId}>
            🚶 {s.label}: {s.distanceKm ? `${s.distanceKm} km` : `${s.minutes} menit`}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-sky-700 dark:text-sky-300">
        Pilihan lain yang tetap valid: berhenti makan saat cukup kenyang dan kembali ke pola normal pada makan berikutnya.
      </p>
    </section>
  );
}
