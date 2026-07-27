"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IconCamera, IconSearch } from "@/components/icons";
import type { DayLog } from "@/lib/types";

type Tab = "catat" | "cari";

function segClass(active: boolean) {
  return `flex items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-medium transition-colors ${
    active ? "bg-white text-brand-700 shadow-sm dark:bg-neutral-800 dark:text-brand-400" : "text-neutral-500"
  }`;
}

function MakanContent() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(searchParams.get("mode") === "cari" ? "cari" : "catat");
  const [historyKey, setHistoryKey] = useState(0);
  const refreshHistory = useCallback(() => setHistoryKey((k) => k + 1), []);

  return (
    <div className="space-y-4 p-4">
      <header className="pt-2">
        <h1 className="text-xl font-bold">Makan</h1>
        <p className="text-sm text-neutral-500">Catat apa yang kamu makan, atau cari opsi yang paling pas sekarang.</p>
      </header>

      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-neutral-100 p-1 dark:bg-neutral-900">
        <button onClick={() => setTab("catat")} className={segClass(tab === "catat")}>
          <IconCamera className="h-4 w-4" /> Catat makanan
        </button>
        <button onClick={() => setTab("cari")} className={segClass(tab === "cari")}>
          <IconSearch className="h-4 w-4" /> Butuh rekomendasi
        </button>
      </div>

      {tab === "catat" ? <CatatTab onSaved={refreshHistory} /> : <CariTab />}

      <MealHistory refreshKey={historyKey} />
    </div>
  );
}

export default function MakanPage() {
  return (
    <Suspense>
      <MakanContent />
    </Suspense>
  );
}

// ---------- Catat makanan (photo → Gemini estimate → save) ----------

interface Analysis {
  foodName: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  portionNote: string;
  confidence: "low" | "medium" | "high";
}

function CatatTab({ onSaved }: { onSaved: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Analysis | null>(null);
  const [portion, setPortion] = useState(1);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleFile(file: File) {
    setError("");
    setResult(null);
    setSaved(false);
    setPortion(1);
    setPreview(URL.createObjectURL(file));
    setAnalyzing(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch("/api/analyze-food", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menganalisa foto");
      setResult(data.analysis);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menganalisa foto");
    } finally {
      setAnalyzing(false);
    }
  }

  async function saveMeal() {
    if (!result) return;
    setSaving(true);
    try {
      await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "meal",
          foodName: result.foodName,
          calories: Math.round(result.calories * portion),
          protein_g: Math.round(result.protein_g * portion),
          carbs_g: Math.round(result.carbs_g * portion),
          fat_g: Math.round(result.fat_g * portion),
          portionNote: result.portionNote,
          source: "photo",
        }),
      });
      setResult(null);
      setPreview(null);
      setPortion(1);
      setSaved(true);
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4">
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
        }}
      />

      {saved && (
        <p className="rounded-xl bg-brand-50 px-4 py-2 text-center text-sm text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">
          Tersimpan ke catatan hari ini ✓
        </p>
      )}

      {!preview && (
        <button
          onClick={() => fileRef.current?.click()}
          className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-brand-300 px-4 py-10 text-brand-600 dark:border-brand-800 dark:text-brand-400"
        >
          <IconCamera className="h-7 w-7" />
          <span className="font-medium">Ambil / pilih foto makanan</span>
        </button>
      )}

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="preview" className="w-full rounded-2xl object-cover" />
      )}

      {preview && (
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full rounded-xl border border-neutral-300 px-4 py-2 text-sm font-medium dark:border-neutral-700"
        >
          Ganti foto
        </button>
      )}

      {analyzing && <p className="text-center text-sm text-neutral-500">Menganalisa foto...</p>}
      {error && <p className="text-center text-sm text-red-500">{error}</p>}

      {result && (
        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
          <div>
            <div className="text-lg font-semibold">{result.foodName}</div>
            <div className="text-xs text-neutral-500">
              {result.portionNote} · keyakinan: {result.confidence}
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2 text-center text-sm">
            <div>
              <div className="font-semibold">{Math.round(result.calories * portion)}</div>
              <div className="text-xs text-neutral-500">kcal</div>
            </div>
            <div>
              <div className="font-semibold">{Math.round(result.protein_g * portion)}g</div>
              <div className="text-xs text-neutral-500">protein</div>
            </div>
            <div>
              <div className="font-semibold">{Math.round(result.carbs_g * portion)}g</div>
              <div className="text-xs text-neutral-500">karbo</div>
            </div>
            <div>
              <div className="font-semibold">{Math.round(result.fat_g * portion)}g</div>
              <div className="text-xs text-neutral-500">lemak</div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs text-neutral-500">Porsi sebenarnya: {portion}x</label>
            <input
              type="range"
              min={0.25}
              max={3}
              step={0.25}
              value={portion}
              onChange={(e) => setPortion(Number(e.target.value))}
              className="w-full"
            />
          </div>

          <button
            onClick={saveMeal}
            disabled={saving}
            className="w-full rounded-xl bg-brand-600 py-3 font-medium text-white disabled:opacity-50"
          >
            {saving ? "Menyimpan..." : "Simpan ke catatan hari ini"}
          </button>
        </section>
      )}
    </div>
  );
}

// ---------- Cari makan (satiety / hunger-mode recommendation) ----------

const INTENTS = [
  ["hungry", "😩 Lapar"], ["sweet", "🍫 Manis"], ["savory", "🧂 Gurih"],
  ["crispy", "🍿 Renyah"], ["comfort", "🍲 Comfort"], ["quick", "⚡ Cepat"],
] as const;
const OBJECTIVES = [
  ["high_volume", "Volume besar"], ["high_protein", "Protein tinggi"],
  ["high_fiber", "Serat tinggi"], ["low_calorie", "Kalori tipis"], ["vegetarian", "Vegetarian"],
] as const;

type SatietyResult = {
  input: { remainingCalories: number; remainingProteinG: number };
  strategy: {
    mealCalorieBudget: number; proteinTargetG: number; message: string; dataNote: string;
    recommendations: Array<{ id: string; name: string; serving: string; calories: number; proteinG: number; fiberG: number; fullnessScore: number; why: string }>;
  };
  ai?: { summary: string; suggestions: string[] } | null;
  aiError?: string;
};

function CariTab() {
  const [intent, setIntent] = useState("hungry");
  const [objectives, setObjectives] = useState<string[]>(["high_volume", "high_protein"]);
  const [pantry, setPantry] = useState("");
  const [result, setResult] = useState<SatietyResult | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleObjective(value: string) {
    setObjectives((current) => (current.includes(value) ? current.filter((x) => x !== value) : [...current, value]));
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
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <div className="text-sm font-medium">Aku sedang mencari...</div>
        <div className="grid grid-cols-3 gap-2">
          {INTENTS.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setIntent(value)}
              className={`rounded-xl border px-2 py-2 text-sm ${intent === value ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/30" : "border-neutral-200 dark:border-neutral-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {OBJECTIVES.map(([value, label]) => (
            <button
              key={value}
              onClick={() => toggleObjective(value)}
              className={`rounded-full px-3 py-1.5 text-xs ${objectives.includes(value) ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <textarea
          value={pantry}
          onChange={(e) => setPantry(e.target.value)}
          placeholder="Bahan yang ada, misalnya: timun, telur, yogurt, ayam"
          className="min-h-20 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
        <button onClick={() => run(false)} disabled={loading} className="w-full rounded-xl bg-brand-600 py-3 font-medium text-white disabled:opacity-50">
          {loading ? "Mencari..." : "Cari pilihan paling mengenyangkan"}
        </button>
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
                  <div>
                    <div className="font-medium">{food.name}</div>
                    <div className="text-xs text-neutral-500">{food.serving}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{food.calories} kcal</div>
                    <div className="text-xs text-neutral-400">{food.proteinG} g protein</div>
                  </div>
                </div>
                <div className="mt-2 text-sm">Fullness {"★".repeat(food.fullnessScore)}{"☆".repeat(5 - food.fullnessScore)}</div>
                <p className="mt-2 text-xs text-neutral-500">{food.why}</p>
              </article>
            ))}
          </section>

          <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium">✨ Penjelasan Gemini</div>
              <button onClick={() => run(true)} disabled={loading} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                Buat recap
              </button>
            </div>
            {result.ai ? (
              <>
                <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">{result.ai.summary}</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {result.ai.suggestions.map((x, i) => <li key={i}>👉 {x}</li>)}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-xs text-neutral-400">Opsional dan hanya dipanggil saat tombol ditekan.</p>
            )}
            {result.aiError && <p className="mt-2 text-xs text-red-500">{result.aiError}</p>}
          </section>
          <p className="text-xs text-neutral-400">{result.strategy.dataNote}</p>
        </>
      )}
    </div>
  );
}

// ---------- Today's meal/burn history ----------

function MealHistory({ refreshKey }: { refreshKey: number }) {
  const [log, setLog] = useState<DayLog | null>(null);

  useEffect(() => {
    fetch("/api/today")
      .then((r) => r.json())
      .then((d) => setLog(d.log));
  }, [refreshKey]);

  async function removeEntry(type: "meal" | "burn", id: string) {
    await fetch(`/api/log?type=${type}&id=${id}`, { method: "DELETE" });
    const res = await fetch("/api/today");
    setLog((await res.json()).log);
  }

  if (!log || (log.meals.length === 0 && log.burns.length === 0)) return null;

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-medium text-neutral-500">Riwayat hari ini</h2>
      {[...log.meals.map((m) => ({ ...m, kind: "meal" as const })), ...log.burns.map((b) => ({ ...b, kind: "burn" as const }))]
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((entry) => (
          <div key={entry.id} className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-neutral-900">
            <div>
              <div className="text-sm font-medium">{entry.kind === "meal" ? "🍽️ " + entry.foodName : "🔥 " + entry.label}</div>
              <div className="text-xs text-neutral-500">
                {new Date(entry.time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={entry.kind === "meal" ? "text-sm font-medium" : "text-sm font-medium text-brand-600"}>
                {entry.kind === "meal" ? "+" : "-"}
                {entry.calories} kcal
              </span>
              <button onClick={() => removeEntry(entry.kind, entry.id)} className="text-neutral-300 hover:text-red-400" aria-label="Hapus">
                ✕
              </button>
            </div>
          </div>
        ))}
    </section>
  );
}
