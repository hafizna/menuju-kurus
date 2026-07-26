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
    <section className="rounded-2xl border border-orange-200 bg-orange-50 p-4 dark:border-orange-900 dark:bg-orange-950/40">
      <div className="mb-2 text-sm font-medium text-orange-700 dark:text-orange-300">
        Kelebihan {Math.round(extraKcal)} kcal hari ini — tebus dengan:
      </div>
      <ul className="space-y-1 text-sm text-orange-800 dark:text-orange-200">
        {suggestions.map((s) => (
          <li key={s.activityId}>
            🏃 {s.label}: {s.distanceKm ? `${s.distanceKm} km` : `${s.minutes} menit`}
          </li>
        ))}
      </ul>
    </section>
  );
}
