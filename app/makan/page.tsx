"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IconCamera, IconSparkle, IconBowl, IconBolt } from "@/components/icons";
import type { DayLog } from "@/lib/types";
import type { DaySummary } from "@/lib/day";
import AnalysisSheet, { type SheetPhase } from "@/components/AnalysisSheet";
import { compressImage, postPhoto, UploadAborted } from "@/lib/clientImage";
import type { FoodAnalysis } from "@/lib/gemini";
import { adjustMeal, hasOil, stapleOf, NO_ADJUST, STAPLE_STEP_G, CENTONG_G, type MealAdjust, type OilLevel, type EatenFraction } from "@/lib/mealMath";

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

interface QuickItem {
  name: string;
  kcal: number;
  protein: number;
  // Added sugar in grams; 0 for items without any (whole fruit does not count).
  sugar: number;
  portion: string;
}

// Typical Indonesian portions. One tap logs it for "now"; Batalkan removes it.
const QUICK_ITEMS: QuickItem[] = [
  { name: "Teh manis", kcal: 110, protein: 0, sugar: 25, portion: "1 gelas" },
  { name: "Es teh manis", kcal: 140, protein: 0, sugar: 30, portion: "1 gelas besar" },
  { name: "Kopi susu", kcal: 180, protein: 3, sugar: 20, portion: "1 gelas" },
  { name: "Minuman kemasan", kcal: 170, protein: 0, sugar: 30, portion: "1 botol kecil" },
  { name: "Gorengan", kcal: 130, protein: 2, sugar: 0, portion: "1 buah" },
  { name: "Kerupuk", kcal: 70, protein: 1, sugar: 0, portion: "2-3 keping" },
  { name: "Roti + selai", kcal: 160, protein: 4, sugar: 8, portion: "1 lembar" },
  { name: "Biskuit", kcal: 120, protein: 2, sugar: 8, portion: "3-4 keping" },
  { name: "Tambah nasi", kcal: 130, protein: 3, sugar: 0, portion: "1 centong" },
  { name: "Buah", kcal: 70, protein: 1, sugar: 0, portion: "1 porsi" },
];

const CONFIDENCE_LABEL = { low: "rendah", medium: "sedang", high: "tinggi" } as const;

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// "HH:MM" today (browser clock) -> ISO instant; null if that time hasn't happened yet.
function eatenAtIso(hhmm: string): string | null {
  const [h, m] = hhmm.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.getTime() > Date.now() + 5 * 60_000 ? null : d.toISOString();
}

function MealTimeField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-neutral-500">Jam makan</span>
      <span className="flex items-center gap-2">
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 tabular-nums dark:border-neutral-700 dark:bg-neutral-800"
        />
        <button type="button" onClick={() => onChange(nowHHMM())} className="text-xs font-medium text-brand-600">
          Sekarang
        </button>
      </span>
    </label>
  );
}

async function postMeal(body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "meal", ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Belum tersimpan. Coba lagi ya.");
  return (data.entry?.id as string | undefined) ?? null;
}

function CatatTab({ onSaved }: { onSaved: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sheet, setSheet] = useState<SheetPhase | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [photoError, setPhotoError] = useState("");
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const lastFile = useRef<File | null>(null);
  const resultRef = useRef<HTMLElement>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FoodAnalysis | null>(null);
  const [name, setName] = useState("");
  const [adj, setAdj] = useState<MealAdjust>(NO_ADJUST);
  const [kcalEdit, setKcalEdit] = useState<string | null>(null);
  const [mealTime, setMealTime] = useState(nowHHMM);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [undoId, setUndoId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(false);

  useEffect(() => {
    if (sheet !== "upload" && sheet !== "read") return;
    const id = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [sheet]);

  async function handleFile(file: File) {
    lastFile.current = file;
    setError("");
    setPhotoError("");
    setResult(null);
    setSaved("");
    setUndoId(null);
    setAdj(NO_ADJUST);
    setKcalEdit(null);
    setManualOpen(false);
    setSeconds(0);
    setPreview(URL.createObjectURL(file));
    setSheet("upload");
    try {
      const photo = await compressImage(file);
      // Some networks never report upload progress; don't leave step 1 spinning.
      const nudge = setTimeout(() => setSheet((p) => (p === "upload" ? "read" : p)), 2500);
      const { status, data } = await postPhoto(photo, {
        onUploaded: () => setSheet("read"),
        register: (xhr) => {
          xhrRef.current = xhr;
        },
      });
      clearTimeout(nudge);
      if (status < 200 || status >= 300 || !data?.analysis) {
        throw new Error(data?.error || "Foto belum bisa dibaca. Coba lagi atau isi manual.");
      }
      const analysis = data.analysis as FoodAnalysis;
      setResult(analysis);
      setName(analysis.foodName);
      setMealTime(nowHHMM());
      setSheet("done");
      await new Promise((resolve) => setTimeout(resolve, 450));
      setSheet(null);
      // Bring the result card (with its Save button) into view.
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
    } catch (e) {
      if (e instanceof UploadAborted) return;
      setPhotoError(e instanceof Error ? e.message : "Foto belum bisa dibaca.");
      setSheet("error");
    }
  }

  function cancelAnalysis() {
    xhrRef.current?.abort();
    setSheet(null);
    reset();
  }

  function reset() {
    setResult(null);
    setPreview(null);
    setAdj(NO_ADJUST);
    setKcalEdit(null);
    setError("");
  }

  async function quickAdd(item: QuickItem) {
    setError("");
    try {
      const id = await postMeal({
        foodName: item.name,
        calories: item.kcal,
        protein_g: item.protein,
        sugar_g: item.sugar,
        portionNote: `${item.portion} (perkiraan umum)`,
        source: "manual",
      });
      setSaved(`${item.name} · ${item.kcal} kcal`);
      setUndoId(id);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Belum tersimpan. Coba lagi ya.");
    }
  }

  async function undoLast() {
    if (!undoId) return;
    await fetch(`/api/log?type=meal&id=${undoId}`, { method: "DELETE" });
    setUndoId(null);
    setSaved("");
    onSaved();
  }

  async function saveMeal() {
    if (!result) return;
    const meal = adjustMeal(result, adj);
    const kcal = kcalEdit !== null ? Number(kcalEdit) : meal.calories;
    if (!Number.isFinite(kcal) || kcal <= 0) {
      setError("Isi kalorinya dulu, harus lebih dari 0.");
      return;
    }
    const time = eatenAtIso(mealTime);
    if (!time) {
      setError("Jam makannya belum lewat. Pilih jam yang sudah terjadi.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      await postMeal({
        time,
        foodName: name.trim() || result.foodName,
        calories: Math.round(kcal),
        protein_g: meal.protein_g,
        carbs_g: meal.carbs_g,
        fat_g: meal.fat_g,
        sugar_g: meal.sugar_g,
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

  const meal = result ? adjustMeal(result, adj) : null;
  const kcalShown = meal ? (kcalEdit ?? String(meal.calories)) : "";
  const staple = result ? stapleOf(result) : undefined;

  function change(next: Partial<MealAdjust>) {
    setAdj((current) => ({ ...current, ...next }));
    setKcalEdit(null);
  }

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
          {undoId && (
            <button type="button" onClick={undoLast} className="ml-2 font-semibold underline underline-offset-2">
              Batalkan
            </button>
          )}
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
          <div>
            <div className="mb-1.5 text-xs text-neutral-500">Cemilan &amp; minuman, sekali ketuk (perkiraan umum)</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ITEMS.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => quickAdd(item)}
                  className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm active:scale-95 dark:border-neutral-700"
                >
                  {item.name} <span className="text-xs text-neutral-400">{item.kcal}</span>
                </button>
              ))}
            </div>
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

      {sheet && (
        <AnalysisSheet
          phase={sheet}
          seconds={seconds}
          preview={preview}
          error={photoError}
          onCancel={cancelAnalysis}
          onRetry={() => lastFile.current && handleFile(lastFile.current)}
          onManual={() => {
            setSheet(null);
            reset();
            setManualOpen(true);
          }}
        />
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-red-500">
          {error}
        </p>
      )}

      {result && (
        <section ref={resultRef} className="scroll-mt-4 space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex gap-3">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Foto makanan" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs text-neutral-500" htmlFor="meal-name">Nama makanan</label>
              <textarea
                id="meal-name"
                rows={name.length > 40 ? 3 : 2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full resize-none rounded-lg border border-neutral-300 px-3 py-2 text-[15px] font-semibold leading-snug dark:border-neutral-700 dark:bg-neutral-800"
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">
              {result.portionNote} · keyakinan {CONFIDENCE_LABEL[result.confidence]}
            </div>
            {result.confidence === "low" && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Tebakannya masih kasar. Cek nama dan kalorinya dulu sebelum disimpan.
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
              <div className="font-semibold">{meal?.protein_g ?? 0}g</div>
              <div className="text-xs text-neutral-500">protein</div>
            </div>
            <div>
              <div className="font-semibold">{meal?.carbs_g ?? 0}g</div>
              <div className="text-xs text-neutral-500">karbo</div>
            </div>
            <div>
              <div className="font-semibold">{meal?.fat_g ?? 0}g</div>
              <div className="text-xs text-neutral-500">lemak</div>
            </div>
          </div>

          {meal && (
            <p className="text-xs text-neutral-500">
              Perkiraan kasar, bisa sekitar {meal.low}–{meal.high} kcal. Koreksi di bawah kalau porsimu beda.
              {meal.sugar_g > 0 && ` Gula tambahan sekitar ${meal.sugar_g} g.`}
            </p>
          )}

          {result.components.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-neutral-50 p-3 text-xs dark:bg-neutral-800/60">
              {result.components.map((c, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-neutral-600 dark:text-neutral-300">
                    {c.name}
                    {c.grams > 0 && <span className="text-neutral-400"> · ±{c.grams} g</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-neutral-500">{c.calories} kcal</span>
                </li>
              ))}
            </ul>
          )}

          {staple && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-neutral-500">
                {staple.name} ≈ {(Math.max(0, staple.grams + adj.stapleDeltaG) / CENTONG_G).toLocaleString("id-ID", { maximumFractionDigits: 1 })} centong
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Kurangi ${staple.name}`}
                  disabled={staple.grams + adj.stapleDeltaG - STAPLE_STEP_G < 0}
                  onClick={() => change({ stapleDeltaG: adj.stapleDeltaG - STAPLE_STEP_G })}
                  className="h-9 w-9 rounded-lg border border-neutral-300 text-lg disabled:opacity-30 dark:border-neutral-700"
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label={`Tambah ${staple.name}`}
                  disabled={staple.grams + adj.stapleDeltaG + STAPLE_STEP_G > 800}
                  onClick={() => change({ stapleDeltaG: adj.stapleDeltaG + STAPLE_STEP_G })}
                  className="h-9 w-9 rounded-lg border border-neutral-300 text-lg disabled:opacity-30 dark:border-neutral-700"
                >
                  +
                </button>
              </span>
            </div>
          )}

          {hasOil(result) && (
            <Segmented<OilLevel>
              label="Minyak / saus"
              value={adj.oil}
              onChange={(oil) => change({ oil })}
              options={[["less", "Sedikit"], ["normal", "Biasa"], ["more", "Banyak"]]}
            />
          )}

          <Segmented<`${EatenFraction}`>
            label="Yang kamu makan"
            value={`${adj.eaten}`}
            onChange={(v) => change({ eaten: Number(v) as EatenFraction })}
            options={[["1", "Habis"], ["0.75", "¾"], ["0.5", "½"], ["0.25", "¼"]]}
          />

          <MealTimeField value={mealTime} onChange={setMealTime} />

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

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<[T, string]>;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-neutral-500">{label}</span>
      <div className="flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800" role="radiogroup" aria-label={label}>
        {options.map(([optionValue, text]) => (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={value === optionValue}
            onClick={() => onChange(optionValue)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              value === optionValue ? "bg-white text-brand-700 shadow-xs dark:bg-neutral-700 dark:text-brand-300" : "text-neutral-500"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function ManualForm({ onSaved }: { onSaved: (label: string) => void }) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [protein, setProtein] = useState("");
  const [sugar, setSugar] = useState("");
  const [mealTime, setMealTime] = useState(nowHHMM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const calories = Number(kcal);
    if (!name.trim() || !Number.isFinite(calories) || calories <= 0) {
      setError("Isi nama makanan dan kalorinya dulu ya.");
      return;
    }
    const time = eatenAtIso(mealTime);
    if (!time) {
      setError("Jam makannya belum lewat. Pilih jam yang sudah terjadi.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      await postMeal({
        time,
        foodName: name.trim(),
        calories,
        protein_g: Number(protein) || 0,
        // Blank stays unknown; only a typed number (including 0) is recorded.
        sugar_g: sugar === "" ? undefined : Number(sugar),
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
        <input value={protein} onChange={(e) => setProtein(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="protein (g)" className={input} />
        <input value={sugar} onChange={(e) => setSugar(e.target.value.replace(/\D/g, ""))} inputMode="numeric" placeholder="gula tambahan (g), boleh kosong" className={`${input} col-span-2`} />
      </div>
      <MealTimeField value={mealTime} onChange={setMealTime} />
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
          {loading ? "Mencari..." : "Cari yang paling bikin kenyang"}
        </button>
      </section>

      {result?.strategy && (
        <>
          <section className="rounded-2xl bg-brand-50 p-4 dark:bg-brand-950/30">
            <div className="text-sm font-medium">Ide buat makan berikutnya</div>
            <div className="mt-1 text-sm">Sisa {result.input.remainingCalories} kcal · sisa protein {result.input.remainingProteinG} g</div>
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
                <div className="mt-2 text-sm">Kenyangnya {"★".repeat(food.fullnessScore)}{"☆".repeat(5 - food.fullnessScore)}</div>
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
              <p className="mt-2 text-xs text-neutral-400">Opsional, baru jalan kalau kamu tekan tombolnya.</p>
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
