"use client";

import { useState } from "react";

const INTENTS = [
  ["hungry", "😩 Lapar"], ["sweet", "🍫 Manis"], ["savory", "🧂 Gurih"],
  ["crispy", "🍿 Renyah"], ["comfort", "🍲 Comfort"], ["quick", "⚡ Cepat"],
] as const;
const OBJECTIVES = [
  ["high_volume", "Volume besar"], ["high_protein", "Protein tinggi"],
  ["high_fiber", "Serat tinggi"], ["low_calorie", "Kalori tipis"], ["vegetarian", "Vegetarian"],
] as const;

type Result = {
  input: { remainingCalories: number; remainingProteinG: number };
  strategy: {
    mealCalorieBudget: number; proteinTargetG: number; message: string; dataNote: string;
    recommendations: Array<{ id: string; name: string; serving: string; calories: number; proteinG: number; fiberG: number; fullnessScore: number; why: string }>;
  };
  ai?: { summary: string; suggestions: string[] } | null;
  aiError?: string;
};

export default function NutritionPage() {
  const [intent, setIntent] = useState("hungry");
  const [objectives, setObjectives] = useState<string[]>(["high_volume", "high_protein"]);
  const [pantry, setPantry] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleObjective(value: string) {
    setObjectives((current) => current.includes(value) ? current.filter((x) => x !== value) : [...current, value]);
  }

  async function run(withAi = false) {
    setLoading(true);
    try {
      const res = await fetch("/api/satiety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent, objectives, pantry, withAi }),
      });
      setResult(await res.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <header className="pt-2">
        <h1 className="text-xl font-bold">🍽️ Nutrition Intelligence</h1>
        <p className="text-sm text-neutral-500">Cari pilihan yang memuaskan berdasarkan sisa kalori, protein, goal, dan bahan yang tersedia.</p>
      </header>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <div className="text-sm font-medium">Aku sedang mencari...</div>
        <div className="grid grid-cols-3 gap-2">
          {INTENTS.map(([value, label]) => (
            <button key={value} onClick={() => setIntent(value)} className={`rounded-xl border px-2 py-2 text-sm ${intent === value ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/30" : "border-neutral-200 dark:border-neutral-700"}`}>{label}</button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {OBJECTIVES.map(([value, label]) => (
            <button key={value} onClick={() => toggleObjective(value)} className={`rounded-full px-3 py-1.5 text-xs ${objectives.includes(value) ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}>{label}</button>
          ))}
        </div>
        <textarea value={pantry} onChange={(e) => setPantry(e.target.value)} placeholder="Bahan yang ada, misalnya: timun, telur, yogurt, ayam" className="min-h-20 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800" />
        <button onClick={() => run(false)} disabled={loading} className="w-full rounded-xl bg-brand-600 py-3 font-medium text-white disabled:opacity-50">{loading ? "Mencari..." : "Cari pilihan paling mengenyangkan"}</button>
      </section>

      {result?.strategy && (
        <>
          <section className="rounded-2xl bg-brand-50 p-4 dark:bg-brand-950/30">
            <div className="text-sm font-medium">Strategi makan berikutnya</div>
            <div className="mt-1 text-sm">Sisa {result.input.remainingCalories} kcal · protein tersisa {result.input.remainingProteinG} g</div>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{result.strategy.message}</p>
          </section>

          <section className="space-y-3">
            {result.strategy.recommendations.map((food) => (
              <article key={food.id} className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
                <div className="flex items-start justify-between gap-3">
                  <div><div className="font-medium">{food.name}</div><div className="text-xs text-neutral-500">{food.serving}</div></div>
                  <div className="text-right"><div className="font-bold">{food.calories} kcal</div><div className="text-xs text-neutral-400">{food.proteinG} g protein</div></div>
                </div>
                <div className="mt-2 text-sm">Fullness {"★".repeat(food.fullnessScore)}{"☆".repeat(5 - food.fullnessScore)}</div>
                <p className="mt-2 text-xs text-neutral-500">{food.why}</p>
              </article>
            ))}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
            <div className="flex items-center justify-between"><div className="text-sm font-medium">✨ Penjelasan Gemini</div><button onClick={() => run(true)} disabled={loading} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">Buat recap</button></div>
            {result.ai ? <><p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">{result.ai.summary}</p><ul className="mt-2 space-y-1 text-sm">{result.ai.suggestions.map((x, i) => <li key={i}>👉 {x}</li>)}</ul></> : <p className="mt-2 text-xs text-neutral-400">Opsional dan hanya dipanggil saat tombol ditekan.</p>}
            {result.aiError && <p className="mt-2 text-xs text-red-500">{result.aiError}</p>}
          </section>
          <p className="text-xs text-neutral-400">{result.strategy.dataNote}</p>
        </>
      )}
    </div>
  );
}
