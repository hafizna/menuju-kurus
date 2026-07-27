"use client";

import { FormEvent, useState } from "react";

const CATEGORIES = [
  ["all", "Semua"],
  ["warteg", "Warteg"],
  ["padang", "Padang"],
  ["ayam", "Ayam"],
  ["bakso_mie", "Bakso & mi"],
  ["soto", "Soto"],
  ["fast_food", "Fast food"],
  ["cafe", "Kafe"],
] as const;

const PORTIONS = [0.5, 0.75, 1, 1.25] as const;

type RestaurantMeal = {
  id: string;
  name: string;
  restaurantLabel: string;
  serving: string;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  fullnessScore: number;
  note: string;
  fitLabel: "pas" | "masih_masuk" | "melewati";
  decision: string;
  confidence: "medium" | "high";
};

type RestaurantResponse = {
  input: {
    remainingCalories: number;
    remainingProteinG: number;
  };
  strategy: {
    message: string;
    recommendations: RestaurantMeal[];
    queryMatched: boolean;
    dataNote: string;
  };
};

function fitLabel(label: RestaurantMeal["fitLabel"]): string {
  if (label === "pas") return "Masuk budget";
  if (label === "masih_masuk") return "Perlu sedikit penyesuaian";
  return "Di atas budget";
}

function fitClass(label: RestaurantMeal["fitLabel"]): string {
  if (label === "pas") return "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300";
  if (label === "masih_masuk") return "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300";
  return "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300";
}

export default function RestaurantIntelligence({ onSaved }: { onSaved: () => void }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const [portion, setPortion] = useState<(typeof PORTIONS)[number]>(1);
  const [result, setResult] = useState<RestaurantResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function search(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError("");
    setSavedId(null);
    try {
      const response = await fetch("/api/restaurant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, category }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal mencari menu");
      setResult(data);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal mencari menu");
    } finally {
      setLoading(false);
    }
  }

  async function saveMeal(meal: RestaurantMeal) {
    setSavingId(meal.id);
    setError("");
    try {
      const response = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "meal",
          foodName: meal.name,
          calories: Math.round(meal.calories * portion),
          protein_g: Math.round(meal.proteinG * portion),
          carbs_g: Math.round(meal.carbsG * portion),
          fat_g: Math.round(meal.fatG * portion),
          portionNote: `${meal.serving} · estimasi restoran ${portion}x`,
          source: "manual",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal menyimpan makanan");
      setSavedId(meal.id);
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal menyimpan makanan");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={search} className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <div className="text-sm font-semibold">Cari menu Indonesia tanpa foto</div>
          <p className="mt-1 text-xs text-neutral-500">
            Decision engine lokal mencocokkan menu, porsi umum, sisa kalori, protein, dan goal-mu.
          </p>
        </div>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Contoh: nasi Padang ayam bakar, bakso, ayam geprek"
          className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />

        <div className="flex gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setCategory(value)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                category === value
                  ? "bg-brand-600 text-white"
                  : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button type="submit" disabled={loading} className="w-full rounded-xl bg-brand-600 py-3 font-medium text-white disabled:opacity-50">
          {loading ? "Mencocokkan menu..." : "Cari keputusan terbaik"}
        </button>
      </form>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600 dark:bg-red-950/30 dark:text-red-300">{error}</p>}

      {result && (
        <>
          <section className="rounded-2xl bg-brand-50 p-4 dark:bg-brand-950/30">
            <div className="text-sm font-medium">Konteks keputusan saat ini</div>
            <div className="mt-1 text-sm">
              Sisa {result.input.remainingCalories} kcal · protein tersisa {result.input.remainingProteinG} g
            </div>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{result.strategy.message}</p>
          </section>

          {result.strategy.recommendations.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 px-1">
                <div>
                  <div className="text-sm font-medium">Asumsi porsi</div>
                  <div className="text-xs text-neutral-500">Koreksi sebelum mencatat.</div>
                </div>
                <div className="flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-900">
                  {PORTIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPortion(value)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                        portion === value ? "bg-white text-brand-700 shadow-sm dark:bg-neutral-800 dark:text-brand-300" : "text-neutral-500"
                      }`}
                    >
                      {value}x
                    </button>
                  ))}
                </div>
              </div>

              {result.strategy.recommendations.map((meal) => {
                const calories = Math.round(meal.calories * portion);
                const protein = Math.round(meal.proteinG * portion);
                const carbs = Math.round(meal.carbsG * portion);
                const fat = Math.round(meal.fatG * portion);
                const adjustedDelta = calories - result.input.remainingCalories;
                const adjustedFit = adjustedDelta <= 0 ? "pas" : adjustedDelta <= 150 ? "masih_masuk" : "melewati";

                return (
                  <article key={meal.id} className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{meal.name}</div>
                        <div className="mt-0.5 text-xs text-neutral-500">{meal.restaurantLabel} · {meal.serving}</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium ${fitClass(adjustedFit)}`}>
                        {fitLabel(adjustedFit)}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center text-sm">
                      <div>
                        <div className="font-semibold tabular-nums">{calories}</div>
                        <div className="text-[11px] text-neutral-500">kcal</div>
                      </div>
                      <div>
                        <div className="font-semibold tabular-nums">{protein}g</div>
                        <div className="text-[11px] text-neutral-500">protein</div>
                      </div>
                      <div>
                        <div className="font-semibold tabular-nums">{carbs}g</div>
                        <div className="text-[11px] text-neutral-500">karbo</div>
                      </div>
                      <div>
                        <div className="font-semibold tabular-nums">{fat}g</div>
                        <div className="text-[11px] text-neutral-500">lemak</div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600 dark:bg-neutral-800/70 dark:text-neutral-300">
                      <div className="font-medium text-neutral-700 dark:text-neutral-200">
                        Fullness {"★".repeat(meal.fullnessScore)}{"☆".repeat(5 - meal.fullnessScore)} · keyakinan {meal.confidence}
                      </div>
                      <p className="mt-1">
                        {adjustedDelta <= 0
                          ? `Masih menyisakan sekitar ${Math.abs(adjustedDelta)} kcal dari budget hari ini.`
                          : adjustedDelta <= 150
                            ? `Sekitar ${adjustedDelta} kcal di atas sisa budget; kurangi nasi atau saus bila ingin lebih dekat target.`
                            : `Sekitar ${adjustedDelta} kcal di atas sisa budget. Pertimbangkan porsi lebih kecil atau menu lain.`}
                      </p>
                      <p className="mt-1 text-neutral-500">{meal.note}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => saveMeal(meal)}
                      disabled={savingId === meal.id}
                      className="w-full rounded-xl border border-brand-300 py-2.5 text-sm font-medium text-brand-700 disabled:opacity-50 dark:border-brand-800 dark:text-brand-300"
                    >
                      {savingId === meal.id ? "Menyimpan..." : savedId === meal.id ? "Tersimpan ✓" : `Catat ${portion}x porsi`}
                    </button>
                  </article>
                );
              })}
            </section>
          )}

          <p className="text-xs text-neutral-400">{result.strategy.dataNote}</p>
        </>
      )}
    </div>
  );
}
