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
  if (label === "pas") return "Masih muat";
  if (label === "masih_masuk") return "Perlu sedikit disesuaikan";
  return "Melebihi sisa jatah";
}

function fitClass(label: RestaurantMeal["fitLabel"]): string {
  if (label === "pas") return "bg-brand-50 text-brand-700";
  if (label === "masih_masuk") return "bg-amber-50 text-amber-700";
  return "bg-red-50 text-red-700";
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
      <form onSubmit={search} className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs">
        <div>
          <div className="text-sm font-semibold">Cari menu makan di luar</div>
          <p className="mt-1 text-xs text-neutral-500">
            Ketik menu yang kamu incar. Aku cocokkan dengan sisa kalori dan proteinmu hari ini, lalu kamu bisa langsung mencatatnya tanpa foto.
          </p>
        </div>

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Contoh: nasi Padang ayam bakar, bakso, ayam geprek"
          className="w-full rounded-xl border border-neutral-300 px-3 py-2.5 text-sm"
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
                  : "bg-neutral-100 text-neutral-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <button type="submit" disabled={loading} className="w-full rounded-xl bg-brand-600 py-3 font-medium text-white disabled:opacity-50">
          {loading ? "Mencari menu..." : "Carikan pilihan yang pas"}
        </button>
      </form>

      {error && <p className="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}

      {result && (
        <>
          <section className="rounded-2xl bg-brand-50 p-4">
            <div className="text-sm font-medium">Sisa jatahmu hari ini</div>
            <div className="mt-1 text-sm">
              Sisa {result.input.remainingCalories} kcal · protein tersisa {result.input.remainingProteinG} g
            </div>
            <p className="mt-2 text-sm text-neutral-600">{result.strategy.message}</p>
          </section>

          {result.strategy.recommendations.length > 0 && (
            <section className="space-y-3">
              <div className="flex items-center justify-between gap-3 px-1">
                <div>
                  <div className="text-sm font-medium">Ukuran porsi</div>
                  <div className="text-xs text-neutral-500">Sesuaikan dulu sebelum dicatat.</div>
                </div>
                <div className="flex gap-1 rounded-xl bg-neutral-100 p-1">
                  {PORTIONS.map((value) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setPortion(value)}
                      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium ${
                        portion === value ? "bg-white text-brand-700 shadow-xs" : "text-neutral-500"
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
                  <article key={meal.id} className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{meal.name}</div>
                        <div className="mt-0.5 text-xs text-neutral-500">{meal.restaurantLabel} · {meal.serving}</div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${fitClass(adjustedFit)}`}>
                        {fitLabel(adjustedFit)}
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-2 text-center text-sm">
                      <div>
                        <div className="font-semibold tabular-nums">{calories}</div>
                        <div className="text-xs text-neutral-500">kcal</div>
                      </div>
                      <div>
                        <div className="font-semibold tabular-nums">{protein}g</div>
                        <div className="text-xs text-neutral-500">protein</div>
                      </div>
                      <div>
                        <div className="font-semibold tabular-nums">{carbs}g</div>
                        <div className="text-xs text-neutral-500">karbo</div>
                      </div>
                      <div>
                        <div className="font-semibold tabular-nums">{fat}g</div>
                        <div className="text-xs text-neutral-500">lemak</div>
                      </div>
                    </div>

                    <div className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600">
                      <div className="font-medium text-neutral-700">
                        Kenyangnya {"★".repeat(meal.fullnessScore)}{"☆".repeat(5 - meal.fullnessScore)} · keyakinan {meal.confidence === "high" ? "tinggi" : "sedang"}
                      </div>
                      <p className="mt-1">
                        {adjustedDelta <= 0
                          ? `Masih menyisakan sekitar ${Math.abs(adjustedDelta)} kcal dari jatah hari ini.`
                          : adjustedDelta <= 150
                            ? `Sekitar ${adjustedDelta} kcal melebihi sisa jatahmu; kurangi nasi atau saus kalau mau lebih dekat ke target.`
                            : `Sekitar ${adjustedDelta} kcal melebihi sisa jatahmu. Coba porsi lebih kecil atau menu lain.`}
                      </p>
                      <p className="mt-1 text-neutral-500">{meal.note}</p>
                    </div>

                    <button
                      type="button"
                      onClick={() => saveMeal(meal)}
                      disabled={savingId === meal.id}
                      className="w-full rounded-xl border border-brand-300 py-2.5 text-sm font-medium text-brand-700 disabled:opacity-50"
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
