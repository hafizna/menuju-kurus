"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IconCamera, IconSparkle, IconBowl, IconBolt } from "@/components/icons";
import type { DayLog } from "@/lib/types";
import type { DaySummary } from "@/lib/day";

interface TodayData {
  log: DayLog;
  summary: DaySummary;
}

function MakanContent() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("mode") === "cari" ? "cari" : "catat";
  const [today, setToday] = useState<TodayData | null>(null);

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/today");
      if (res.ok) {
        const d = await res.json();
        setToday({ log: d.log, summary: d.summary });
      }
    } catch {
      // The panel simply stays hidden if today's data can't be loaded.
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return (
    <div className="space-y-4 p-4">
      <TodayBar summary={today?.summary ?? null} />

      {tab === "catat" ? <CatatTab onSaved={reload} /> : <CariTab />}

      <MealHistory log={today?.log ?? null} onChanged={reload} />
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

function TodayBar({ summary }: { summary: DaySummary | null }) {
  if (!summary) return <div className="h-[72px] rounded-2xl bg-neutral-100 dark:bg-neutral-900" />;
  const over = summary.caloriesIn > summary.target;
  const pct = Math.min(100, Math.max(0, (summary.caloriesIn / summary.target) * 100));
  return (
    <section className="rounded-2xl bg-linear-to-br from-brand-600 to-brand-800 p-4 text-white">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-brand-100">Hari ini</span>
        <span className="text-sm font-semibold tabular-nums">
          {over
            ? `${(summary.caloriesIn - summary.target).toLocaleString("id-ID")} kcal melebihi target`
            : `sisa ${(summary.target - summary.caloriesIn).toLocaleString("id-ID")} kcal`}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
        <div
          className={`h-full rounded-full transition-all duration-700 ${over ? "bg-amber-300" : "bg-white"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 text-xs text-brand-100 tabular-nums">
        {summary.caloriesIn} / {summary.target} kcal
      </div>
    </section>
  );
}

// ---------- Catat makanan (foto → estimasi → simpan, atau tulis manual) ----------

interface Analysis {
  foodName: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  portionNote: string;
  confidence: "low" | "medium" | "high";
}

const CONFIDENCE_LABEL = { low: "rendah", medium: "sedang", high: "tinggi" } as const;

async function postMeal(body: Record<string, unknown>) {
  const res = await fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "meal", ...body }),
  });
  if (!res.ok) throw new Error("Gagal menyimpan. Coba lagi.");
}

function CatatTab({ onSaved }: { onSaved: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Analysis | null>(null);
  const [name, setName] = useState("");
  const [portion, setPortion] = useState(1);
  const [kcalEdit, setKcalEdit] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [manualOpen, setManualOpen] = useState(false);

  async function handleFile(file: File) {
    setError("");
    setResult(null);
    setSaved("");
    setPortion(1);
    setKcalEdit(null);
    setManualOpen(false);
    setPreview(URL.createObjectURL(file));
    setAnalyzing(true);
    try {
      const form = new FormData();
      form.append("photo", file);
      const res = await fetch("/api/analyze-food", { method: "POST", body: form });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menganalisa foto");
      setResult(data.analysis);
      setName(data.analysis.foodName);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menganalisa foto");
    } finally {
      setAnalyzing(false);
    }
  }

  function reset() {
    setResult(null);
    setPreview(null);
    setPortion(1);
    setKcalEdit(null);
    setError("");
  }

  async function saveMeal() {
    if (!result) return;
    const kcal = kcalEdit !== null ? Number(kcalEdit) : Math.round(result.calories * portion);
    if (!Number.isFinite(kcal) || kcal <= 0) {
      setError("Isi kalori dengan angka lebih dari 0.");
      return;
    }
    setSaving(true);
    try {
      await postMeal({
        foodName: name.trim() || result.foodName,
        calories: Math.round(kcal),
        protein_g: Math.round(result.protein_g * portion),
        carbs_g: Math.round(result.carbs_g * portion),
        fat_g: Math.round(result.fat_g * portion),
        portionNote: result.portionNote,
        source: "photo",
      });
      setSaved(`${name.trim() || result.foodName} · ${Math.round(kcal)} kcal`);
      reset();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  const kcalShown = result ? (kcalEdit ?? String(Math.round(result.calories * portion))) : "";

  return (
    <div className="space-y-4">
      {(["environment", undefined] as const).map((capture) => (
        <input
          key={capture ?? "gallery"}
          ref={capture ? cameraRef : galleryRef}
          type="file"
          accept="image/*"
          capture={capture}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleFile(f);
          }}
        />
      ))}

      {saved && (
        <p role="status" className="rounded-xl bg-brand-50 px-4 py-2 text-center text-sm text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">
          Tersimpan: {saved} ✓
        </p>
      )}

      {!preview && (
        <section className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-sm font-medium">Apa yang kamu makan?</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => cameraRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-brand-600 px-3 py-5 text-white"
            >
              <IconCamera className="h-6 w-6" />
              <span className="text-sm font-semibold">Foto sekarang</span>
            </button>
            <button
              onClick={() => galleryRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-brand-300 px-3 py-5 text-brand-700 dark:border-brand-800 dark:text-brand-300"
            >
              <IconBowl className="h-6 w-6" />
              <span className="text-sm font-semibold">Dari galeri</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setManualOpen((v) => !v)}
              className="rounded-xl border border-neutral-200 py-2.5 text-sm font-medium dark:border-neutral-700"
            >
              {manualOpen ? "Tutup form" : "Tulis manual"}
            </button>
            <Link
              href="/makan/habits"
              className="rounded-xl border border-neutral-200 py-2.5 text-center text-sm font-medium dark:border-neutral-700"
            >
              Yang sering →
            </Link>
          </div>
        </section>
      )}

      {manualOpen && !preview && (
        <ManualForm
          onSaved={(label) => {
            setSaved(label);
            setManualOpen(false);
            onSaved();
          }}
        />
      )}

      {preview && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={preview} alt="Foto makanan" className="max-h-72 w-full rounded-2xl object-cover" />
      )}

      {analyzing && <p className="text-center text-sm text-neutral-500">Menganalisa foto...</p>}
      {error && (
        <div className="space-y-2 text-center">
          <p role="alert" className="text-sm text-red-500">{error}</p>
          {preview && !result && (
            <button
              onClick={() => {
                reset();
                setManualOpen(true);
              }}
              className="rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"
            >
              Isi manual saja
            </button>
          )}
        </div>
      )}

      {result && (
        <section className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div>
            <label className="mb-1 block text-xs text-neutral-500">Nama makanan</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2 font-semibold dark:border-neutral-700 dark:bg-neutral-800"
            />
            <div className="mt-1 text-xs text-neutral-500">
              {result.portionNote} · keyakinan {CONFIDENCE_LABEL[result.confidence]}
            </div>
            {result.confidence === "low" && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Ini perkiraan kasar. Cek nama dan kalorinya sebelum disimpan.
              </p>
            )}
          </div>

          <div className="grid grid-cols-4 items-end gap-2 text-center text-sm">
            <div>
              <input
                inputMode="numeric"
                value={kcalShown}
                onChange={(e) => setKcalEdit(e.target.value.replace(/\D/g, ""))}
                aria-label="Kalori"
                className="w-full rounded-lg border border-neutral-300 px-1 py-1.5 text-center font-semibold dark:border-neutral-700 dark:bg-neutral-800"
              />
              <div className="mt-0.5 text-xs text-neutral-500">kcal</div>
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
              onChange={(e) => {
                setPortion(Number(e.target.value));
                setKcalEdit(null);
              }}
              className="w-full"
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={reset}
              disabled={saving}
              className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-medium dark:border-neutral-700"
            >
              Ulangi
            </button>
            <button
              onClick={saveMeal}
              disabled={saving}
              className="flex-1 rounded-xl bg-brand-600 py-3 font-medium text-white disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Simpan ke catatan hari ini"}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}

function ManualForm({ onSaved }: { onSaved: (label: string) => void }) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const calories = Number(kcal);
    if (!name.trim() || !Number.isFinite(calories) || calories <= 0) {
      setError("Isi nama makanan dan kalori (lebih dari 0).");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await postMeal({
        foodName: name.trim(),
        calories,
        protein_g: Number(protein) || 0,
        source: "manual",
      });
      onSaved(`${name.trim()} · ${Math.round(calories)} kcal`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan.");
    } finally {
      setSaving(false);
    }
  }

  const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800";
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama makanan, mis. nasi goreng" className={input} />
      <div className="grid grid-cols-2 gap-2">
        <input value={kcal} onChange={(e) => setKcal(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="kalori (kcal)" className={input} />
        <input value={protein} onChange={(e) => setProtein(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="protein g (opsional)" className={input} />
      </div>
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <button type="submit" disabled={saving} className="w-full rounded-xl bg-brand-600 py-3 font-medium text-white disabled:opacity-50">
        {saving ? "Menyimpan..." : "Simpan"}
      </button>
    </form>
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
  ai?: { summary: string; suggestions: string[]; source: "ai" | "template" } | null;
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
      <section className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
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
              <article key={food.id} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
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

          <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <IconSparkle className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                {result.ai?.source === "template" ? "Penjelasan Otomatis" : "Penjelasan AI"}
              </div>
              <button onClick={() => run(true)} disabled={loading} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                Buat recap
              </button>
            </div>
            {result.ai?.source === "template" && (
              <p className="mt-1 text-xs text-neutral-400">
                Dibuat dari data langsung tanpa AI (DeepSeek belum diaktifkan) — tetap gratis.
              </p>
            )}
            {result.ai ? (
              <>
                <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">{result.ai.summary}</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {result.ai.suggestions.map((x, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                      {x}
                    </li>
                  ))}
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

function MealHistory({ log, onChanged }: { log: DayLog | null; onChanged: () => void }) {
  async function removeEntry(type: "meal" | "burn", id: string) {
    await fetch(`/api/log?type=${type}&id=${id}`, { method: "DELETE" });
    onChanged();
  }

  if (!log || (log.meals.length === 0 && log.burns.length === 0)) return null;

  return (
    <section className="space-y-2">
      <h2 className="px-1 text-sm font-medium text-neutral-500">Riwayat hari ini</h2>
      {[...log.meals.map((m) => ({ ...m, kind: "meal" as const })), ...log.burns.map((b) => ({ ...b, kind: "burn" as const }))]
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((entry) => (
          <div key={entry.id} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white px-4 py-3 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  entry.kind === "meal" ? "bg-brand-50 text-brand-600 dark:bg-brand-950/40" : "bg-orange-50 text-orange-600 dark:bg-orange-950/40"
                }`}
              >
                {entry.kind === "meal" ? <IconBowl className="h-4 w-4" /> : <IconBolt className="h-4 w-4" />}
              </span>
              <div>
                <div className="text-sm font-medium">{entry.kind === "meal" ? entry.foodName : entry.label}</div>
                <div className="text-xs text-neutral-500">
                  {new Date(entry.time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={entry.kind === "meal" ? "text-sm font-medium tabular-nums" : "text-sm font-medium tabular-nums text-brand-600"}>
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
