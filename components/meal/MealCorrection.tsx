"use client";

import { useEffect, useRef, useState } from "react";
import type { MealEntry } from "@/lib/types";
import type { FoodAnalysis } from "@/lib/gemini";
import { NO_ADJUST, mealTotals, portionSummary, type MealAdjust } from "@/lib/mealMath";
import { mealTimeInput, mealTimeToIso } from "@/lib/mealDraft";
import MealReview from "./MealReview";
import { MealTimeField } from "./MealFields";

interface Props {
  meal: MealEntry;
  /** The day the meal belongs to; a correction never moves it to another day. */
  date: string;
  timezone: string;
  onClose: () => void;
  onSaved: (message: string) => void;
}

const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800";

async function patchMeal(body: Record<string, unknown>) {
  const response = await fetch("/api/log", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Koreksi belum tersimpan. Coba lagi.");
}

// Opens a saved meal for correction. A meal that kept its ingredients is
// reviewed like a fresh photo estimate (amounts, oil, protein, a note for the
// AI); any other meal gets plain fields for the numbers.
export default function MealCorrection({ meal, date, timezone, onClose, onSaved }: Props) {
  const breakdown = meal.breakdown;
  const [analysis, setAnalysis] = useState<FoodAnalysis | null>(breakdown?.analysis ?? null);
  const [adjust, setAdjust] = useState<MealAdjust>(breakdown?.adjust ?? NO_ADJUST);
  const [kcalEdit, setKcalEdit] = useState<string | null>(breakdown?.kcalEdit == null ? null : String(breakdown.kcalEdit));
  const [proteinEdit, setProteinEdit] = useState<string | null>(breakdown?.proteinEdit == null ? null : String(breakdown.proteinEdit));
  const [note, setNote] = useState(breakdown?.note ?? "");
  const [name, setName] = useState(meal.foodName);
  const [time, setTime] = useState(mealTimeInput(meal.time, timezone));
  const [plain, setPlain] = useState({
    kcal: String(meal.calories), protein: String(meal.protein_g), carbs: String(meal.carbs_g), fat: String(meal.fat_g),
    sugar: meal.sugar_g === undefined ? "" : String(meal.sugar_g),
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    dialog.current?.focus();
    const close = (event: KeyboardEvent) => { if (event.key === "Escape" && !saving) onClose(); };
    window.addEventListener("keydown", close);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", close); document.body.style.overflow = ""; };
  }, [onClose, saving]);

  async function save() {
    if (saving) return;
    const iso = mealTimeToIso(time, date, timezone);
    if (!iso) { setError("Pilih jam makannya dulu."); return; }
    const foodName = name.trim();
    if (!foodName) { setError("Nama makanan harus diisi."); return; }
    setSaving(true); setError("");
    try {
      if (analysis) {
        const { meal: totals, calories, protein_g } = mealTotals(analysis, adjust, kcalEdit, proteinEdit);
        if (!Number.isFinite(calories) || calories <= 0) throw new Error("Isi kalorinya dulu, harus lebih dari 0.");
        if (!Number.isFinite(protein_g) || protein_g < 0) throw new Error("Isi protein dengan angka 0 atau lebih.");
        await patchMeal({
          mealId: meal.id, date, foodName, time: iso,
          calories: Math.round(calories), protein_g: Math.round(protein_g), carbs_g: totals.carbs_g, fat_g: totals.fat_g,
          ...(totals.sugar_g === undefined ? {} : { sugar_g: totals.sugar_g }),
          portionNote: portionSummary(analysis, adjust, totals, { kcal: kcalEdit !== null, protein: proteinEdit !== null }),
          breakdown: {
            analysis, adjust,
            kcalEdit: kcalEdit === null ? null : Number(kcalEdit),
            proteinEdit: proteinEdit === null ? null : Number(proteinEdit),
            note: note.trim() || undefined,
            // The words the meal was first estimated from stay with it.
            described: breakdown?.described,
          },
        });
        onSaved(`${foodName} · ${Math.round(calories)} kcal`);
      } else {
        const calories = Number(plain.kcal);
        if (!Number.isFinite(calories) || calories <= 0) throw new Error("Isi kalorinya dulu, harus lebih dari 0.");
        await patchMeal({
          mealId: meal.id, date, foodName, time: iso,
          calories, protein_g: Number(plain.protein) || 0, carbs_g: Number(plain.carbs) || 0, fat_g: Number(plain.fat) || 0,
          // Blank means unknown; only a typed number, including 0, is recorded.
          sugar_g: plain.sugar === "" ? null : Number(plain.sugar),
        });
        onSaved(`${foodName} · ${Math.round(calories)} kcal`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Koreksi belum tersimpan. Coba lagi.");
      setSaving(false);
    }
  }

  const digits = (value: string) => value.replace(/\D/g, "");
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 sm:items-center" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="meal-fix-title"
        tabIndex={-1}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-4 shadow-xl outline-none sm:rounded-3xl dark:bg-neutral-900"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 id="meal-fix-title" className="text-lg font-semibold">Koreksi makanan</h2>
            <p className="mt-0.5 text-xs text-neutral-500">{date} · tersimpan sebagai {meal.source === "photo" ? "hasil foto" : breakdown?.described ? "hasil hitung dari tulisan" : "catatan manual"}</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Tutup koreksi" className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800">✕</button>
        </div>

        <fieldset disabled={saving} className="min-w-0 space-y-3">
          {analysis ? (
            <>
            {breakdown?.described && <p className="rounded-xl bg-neutral-50 p-3 text-xs text-neutral-600 dark:bg-neutral-800/60 dark:text-neutral-300">Yang kamu tulis: {breakdown.described}</p>}
            <MealReview
              idPrefix="fix"
              from={breakdown?.described ? "text" : "photo"}
              analysis={analysis}
              name={name} onName={setName}
              adjust={adjust} onAdjust={setAdjust}
              kcalEdit={kcalEdit} onKcalEdit={setKcalEdit}
              proteinEdit={proteinEdit} onProteinEdit={setProteinEdit}
              note={note} onNote={setNote}
              onRefined={(next) => {
                if (name.trim() === analysis.foodName) setName(next.foodName);
                setAnalysis(next); setAdjust(NO_ADJUST); setKcalEdit(null); setProteinEdit(null);
              }}
              time={time} onTime={setTime} timezone={timezone}
            />
            </>
          ) : (
            <div className="space-y-3">
              {meal.source === "photo" && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Rincian bahan tidak tersimpan untuk catatan ini, jadi hanya angkanya yang bisa dikoreksi.</p>}
              <label className="block text-xs text-neutral-500">Nama makanan<input value={name} onChange={(e) => setName(e.target.value)} className={`${input} mt-1`} /></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-neutral-500">Kalori (kcal)<input aria-label="Kalori" value={plain.kcal} onChange={(e) => setPlain({ ...plain, kcal: digits(e.target.value) })} inputMode="numeric" className={`${input} mt-1`} /></label>
                <label className="text-xs text-neutral-500">Protein (g)<input aria-label="Protein" value={plain.protein} onChange={(e) => setPlain({ ...plain, protein: digits(e.target.value) })} inputMode="numeric" className={`${input} mt-1`} /></label>
                <label className="text-xs text-neutral-500">Karbo (g)<input aria-label="Karbo" value={plain.carbs} onChange={(e) => setPlain({ ...plain, carbs: digits(e.target.value) })} inputMode="numeric" className={`${input} mt-1`} /></label>
                <label className="text-xs text-neutral-500">Lemak (g)<input aria-label="Lemak" value={plain.fat} onChange={(e) => setPlain({ ...plain, fat: digits(e.target.value) })} inputMode="numeric" className={`${input} mt-1`} /></label>
                <label className="col-span-2 text-xs text-neutral-500">Gula tambahan (g), kosongkan kalau tidak tahu<input aria-label="Gula tambahan" value={plain.sugar} onChange={(e) => setPlain({ ...plain, sugar: digits(e.target.value) })} inputMode="numeric" className={`${input} mt-1`} /></label>
              </div>
              <MealTimeField value={time} onChange={setTime} timezone={timezone} />
            </div>
          )}
        </fieldset>

        {error && <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-300">{error}</p>}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-medium dark:border-neutral-700">Batal</button>
          <button type="button" onClick={() => void save()} disabled={saving} className="flex-1 rounded-xl bg-brand-600 py-3 font-medium text-white disabled:opacity-50">{saving ? "Menyimpan..." : "Simpan koreksi"}</button>
        </div>
      </div>
    </div>
  );
}
