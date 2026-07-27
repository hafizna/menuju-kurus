"use client";

import { useEffect, useMemo, useState } from "react";
import type { UserSettings } from "@/lib/types";
import type { WeightTrend } from "@/lib/weight";
import { computeWeightForecast } from "@/lib/weightForecast";

export default function WeightForecastCard({ trend }: { trend: WeightTrend }) {
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings));
  }, []);

  const forecast = useMemo(
    () => (settings ? computeWeightForecast(trend, settings.goalWeightKg) : null),
    [settings, trend]
  );

  if (!forecast) return null;

  return (
    <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium">🧭 Perkiraan menuju target</div>
          <div className="text-xs text-neutral-500">Target {forecast.goalWeight} kg</div>
        </div>
        {forecast.remainingKg !== null && (
          <div className="text-right">
            <div className="text-lg font-bold">{forecast.remainingKg} kg</div>
            <div className="text-xs text-neutral-400">tersisa</div>
          </div>
        )}
      </div>

      {forecast.status === "ready" && forecast.estimatedDate ? (
        <div className="rounded-xl bg-brand-50 p-3 dark:bg-brand-950/30">
          <div className="text-xs text-neutral-500">Dengan pace saat ini</div>
          <div className="text-xl font-bold text-brand-700 dark:text-brand-300">
            {new Date(forecast.estimatedDate).toLocaleDateString("id-ID", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </div>
          <div className="text-xs text-neutral-500">sekitar {forecast.estimatedWeeks} minggu</div>
        </div>
      ) : (
        <div className="rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
          {forecast.status === "goal-reached" ? "🎉 " : forecast.status === "moving-away" ? "↗️ " : "📊 "}
          {forecast.message}
        </div>
      )}

      {forecast.status === "ready" && <p className="mt-2 text-xs text-neutral-400">{forecast.message}</p>}
    </section>
  );
}
