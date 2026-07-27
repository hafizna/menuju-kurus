"use client";

import { useEffect, useState } from "react";

type HabitMeal = {
  key: string;
  name: string;
  count: number;
  daysSeen: number;
  averageCalories: number;
  averageProteinG: number;
  averageCarbsG: number;
  averageFatG: number;
  portionNote?: string;
  usualWindow: string;
  lastSeenDate: string;
  confidence: "emerging" | "established";
};

type HabitStrategy = {
  lookbackDays: number;
  loggedDays: number;
  mealCount: number;
  readiness: "insufficient" | "learning" | "ready";
  readinessPercent: number;
  readinessMessage: string;
  recurringMeals: HabitMeal[];
  mealWindows: Array<{ id: string; label: string; count: number; sharePercent: number; averageCalories: number }>;
  insights: Array<{ id: string; tone: "supportive" | "watch" | "neutral"; title: string; detail: string; evidence: string }>;
  dataNote: string;
};

function readinessLabel(readiness: HabitStrategy["readiness"]): string {
  if (readiness === "ready") return "Pola siap digunakan";
  if (readiness === "learning") return "Sedang mempelajari pola";
  return "Data belum cukup";
}

function insightClass(tone: HabitStrategy["insights"][number]["tone"]): string {
  if (tone === "supportive") return "border-brand-200 bg-brand-50 dark:border-brand-900 dark:bg-brand-950/30";
  if (tone === "watch") return "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30";
  return "border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-900";
}

export default function HabitIntelligence() {
  const [strategy, setStrategy] = useState<HabitStrategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/habits");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal membaca kebiasaan");
      setStrategy(data.strategy);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal membaca kebiasaan");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function quickAdd(meal: HabitMeal) {
    setSavingKey(meal.key);
    setSavedKey(null);
    setError("");
    try {
      const response = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "meal",
          foodName: meal.name,
          calories: meal.averageCalories,
          protein_g: meal.averageProteinG,
          carbs_g: meal.averageCarbsG,
          fat_g: meal.averageFatG,
          portionNote: `${meal.portionNote ? `${meal.portionNote} · ` : ""}quick add dari rata-rata ${meal.count} catatan`,
          source: "manual",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal mencatat makanan");
      setSavedKey(meal.key);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal mencatat makanan");
    } finally {
      setSavingKey(null);
    }
  }

  if (loading && !strategy) {
    return <p className="rounded-2xl border border-neutral-100 bg-white p-4 text-sm text-neutral-500 dark:border-neutral-800 dark:bg-neutral-900">Membaca pola 28 hari terakhir...</p>;
  }

  if (!strategy) {
    return <p className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30">{error || "Data kebiasaan belum tersedia."}</p>;
  }

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">Kesiapan data</p>
            <h2 className="mt-1 font-semibold">{readinessLabel(strategy.readiness)}</h2>
          </div>
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs tabular-nums text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300">
            {strategy.readinessPercent}%
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${strategy.readinessPercent}%` }} />
        </div>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">{strategy.readinessMessage}</p>
        <p className="mt-2 text-xs text-neutral-400">28 hari · {strategy.loggedDays} hari tercatat · {strategy.mealCount} makanan</p>
      </section>

      {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600 dark:bg-red-950/30">{error}</p>}

      <section className="space-y-2">
        <div className="px-1">
          <h2 className="font-semibold">Quick add dari kebiasaan</h2>
          <p className="text-xs text-neutral-500">Hanya menu yang muncul minimal dua kali. Nilai memakai rata-rata catatanmu sendiri.</p>
        </div>
        {strategy.recurringMeals.length ? (
          strategy.recurringMeals.map((meal) => (
            <article key={meal.key} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{meal.name}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">{meal.usualWindow} · {meal.count} kali pada {meal.daysSeen} hari</div>
                </div>
                <span className="shrink-0 text-right text-sm font-semibold tabular-nums">{meal.averageCalories} kcal</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-neutral-50 px-2 py-2 dark:bg-neutral-800"><strong className="block text-sm">{meal.averageProteinG} g</strong>protein</div>
                <div className="rounded-xl bg-neutral-50 px-2 py-2 dark:bg-neutral-800"><strong className="block text-sm">{meal.averageCarbsG} g</strong>karbo</div>
                <div className="rounded-xl bg-neutral-50 px-2 py-2 dark:bg-neutral-800"><strong className="block text-sm">{meal.averageFatG} g</strong>lemak</div>
              </div>
              {meal.portionNote && <p className="mt-2 text-xs text-neutral-500">Asumsi tersering: {meal.portionNote}</p>}
              <button
                onClick={() => quickAdd(meal)}
                disabled={savingKey === meal.key}
                className="mt-3 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {savingKey === meal.key ? "Menyimpan..." : savedKey === meal.key ? "Tersimpan ✓" : "Tambahkan seperti biasanya"}
              </button>
            </article>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-700">Belum ada menu yang berulang minimal dua kali.</p>
        )}
      </section>

      {strategy.mealWindows.length > 0 && (
        <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h2 className="font-semibold">Waktu makan yang tercatat</h2>
          <div className="mt-3 space-y-3">
            {strategy.mealWindows.map((window) => (
              <div key={window.id}>
                <div className="flex items-center justify-between text-sm">
                  <span>{window.label}</span>
                  <span className="tabular-nums text-neutral-500">{window.sharePercent}% · {window.count}x</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${window.sharePercent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {strategy.insights.length > 0 && (
        <section className="space-y-2">
          <div className="px-1">
            <h2 className="font-semibold">Pola yang perlu diketahui</h2>
            <p className="text-xs text-neutral-500">Sinyal untuk keputusan berikutnya, bukan vonis atau hubungan sebab-akibat.</p>
          </div>
          {strategy.insights.map((insight) => (
            <article key={insight.id} className={`rounded-2xl border p-4 ${insightClass(insight.tone)}`}>
              <h3 className="font-medium">{insight.title}</h3>
              <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{insight.detail}</p>
              <p className="mt-2 text-xs font-medium text-neutral-500">{insight.evidence}</p>
            </article>
          ))}
        </section>
      )}

      <p className="px-1 text-xs text-neutral-400">{strategy.dataNote}</p>
    </div>
  );
}
