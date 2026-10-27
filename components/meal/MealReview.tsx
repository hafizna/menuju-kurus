"use client";

import { useState } from "react";
import type { FoodAnalysis } from "@/lib/gemini";
import {
  CENTONG_G, STAPLE_STEP_G, hasOil, mealTotals, stapleOf, stepScale,
  type EatenFraction, type MealAdjust, type OilLevel,
} from "@/lib/mealMath";
import { MAX_MEAL_NOTE_LENGTH } from "@/lib/mealNote";
import { MealTimeField, Segmented } from "./MealFields";

const CONFIDENCE_LABEL = { low: "rendah", medium: "sedang", high: "tinggi" } as const;
const field = "w-full rounded-lg border border-neutral-300 px-1 py-1.5 text-center font-semibold dark:border-neutral-700 dark:bg-neutral-800";
const stepper = "h-8 w-8 rounded-lg border border-neutral-300 text-base disabled:opacity-30 dark:border-neutral-700";

interface Props {
  analysis: FoodAnalysis;
  name: string;
  onName: (value: string) => void;
  adjust: MealAdjust;
  onAdjust: (value: MealAdjust) => void;
  kcalEdit: string | null;
  onKcalEdit: (value: string | null) => void;
  proteinEdit: string | null;
  onProteinEdit: (value: string | null) => void;
  note: string;
  onNote: (value: string) => void;
  /** The AI revised the ingredients from the note; the parent resets the corrections that belonged to the old ones. */
  onRefined: (next: FoodAnalysis) => void;
  time: string;
  onTime: (value: string) => void;
  timezone: string;
  /** Preview of the photo, when this estimate came from one in this session. */
  photo?: string | null;
  /** Keeps element ids unique when two reviews exist on one page. */
  idPrefix?: string;
}

// The review of one meal estimate: what it is made of, what can be corrected,
// and what will be saved. Used right after a photo is read and again when a
// saved meal is opened for correction, so both behave the same way.
export default function MealReview(props: Props) {
  const { analysis, name, adjust, kcalEdit, proteinEdit, note, time, timezone, photo, idPrefix = "meal" } = props;
  const [refining, setRefining] = useState(false);
  const [refineError, setRefineError] = useState("");
  const [refined, setRefined] = useState(false);

  const { meal } = mealTotals(analysis, adjust, kcalEdit, proteinEdit);
  const kcalShown = kcalEdit ?? String(meal.calories);
  const proteinShown = proteinEdit ?? String(meal.protein_g);
  const staple = stapleOf(analysis);

  // Changing an amount makes any number typed over the estimate stale, so both go back to the estimate.
  function change(next: Partial<MealAdjust>) {
    props.onAdjust({ ...adjust, ...next });
    props.onKcalEdit(null);
    props.onProteinEdit(null);
  }
  function stepIngredient(index: number, direction: 1 | -1) {
    const scales = analysis.components.map((_, i) => adjust.scales?.[i] ?? 1);
    scales[index] = stepScale(scales[index], direction);
    change({ scales });
  }

  async function refine() {
    const text = note.trim();
    if (!text || refining) return;
    setRefining(true); setRefineError(""); setRefined(false);
    try {
      const response = await fetch("/api/refine-food", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis, note: text }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.analysis) throw new Error(data.error || "Hitung ulang belum berhasil. Coba lagi.");
      props.onRefined(data.analysis as FoodAnalysis);
      setRefined(true);
    } catch (cause) {
      setRefineError(cause instanceof Error ? cause.message : "Hitung ulang belum berhasil. Coba lagi.");
    } finally { setRefining(false); }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-3">
        {photo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="Foto makanan" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
        )}
        <div className="min-w-0 flex-1">
          <label className="mb-1 block text-xs text-neutral-500" htmlFor={`${idPrefix}-name`}>Nama makanan</label>
          <textarea
            id={`${idPrefix}-name`}
            rows={name.length > 40 ? 3 : 2}
            value={name}
            onChange={(e) => props.onName(e.target.value)}
            className="w-full resize-none rounded-lg border border-neutral-300 px-3 py-2 text-[15px] font-semibold leading-snug dark:border-neutral-700 dark:bg-neutral-800"
          />
        </div>
      </div>
      <div>
        <div className="text-xs text-neutral-500">
          {analysis.portionNote} · keyakinan {CONFIDENCE_LABEL[analysis.confidence]}
        </div>
        {analysis.confidence === "low" && (
          <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
            Tebakannya masih kasar. Cek nama dan kalorinya dulu sebelum disimpan.
          </p>
        )}
      </div>

      <div className="grid grid-cols-4 items-end gap-2 text-center text-sm">
        <div>
          <input inputMode="numeric" value={kcalShown} onChange={(e) => props.onKcalEdit(e.target.value.replace(/\D/g, ""))} aria-label="Kalori" className={field} />
          <div className="mt-0.5 text-xs text-neutral-500">kcal</div>
        </div>
        <div>
          <input inputMode="numeric" value={proteinShown} onChange={(e) => props.onProteinEdit(e.target.value.replace(/\D/g, ""))} aria-label="Protein" className={field} />
          <div className="mt-0.5 text-xs text-neutral-500">protein (g)</div>
        </div>
        <div>
          <div className="font-semibold">{meal.carbs_g}g</div>
          <div className="text-xs text-neutral-500">karbo</div>
        </div>
        <div>
          <div className="font-semibold">{meal.fat_g}g</div>
          <div className="text-xs text-neutral-500">lemak</div>
        </div>
      </div>

      {kcalEdit !== null && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Kalori memakai angka yang kamu isi. Makro dan rincian di bawah tetap estimasi porsi, bukan perhitungan ulang dari kalori ini. <button type="button" onClick={() => props.onKcalEdit(null)} className="font-semibold underline">Kembali ke estimasi porsi</button></p>}
      {proteinEdit !== null && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Protein memakai angka yang kamu isi. Kalori dan rincian di bawah tetap estimasi porsi. <button type="button" onClick={() => props.onProteinEdit(null)} className="font-semibold underline">Kembali ke estimasi porsi</button></p>}
      {kcalEdit === null && (
        <p className="text-xs text-neutral-500">
          Perkiraan kasar, bisa sekitar {meal.low}–{meal.high} kcal. Koreksi di bawah kalau porsimu beda.
        </p>
      )}
      {(meal.sugar_g ?? 0) > 0 && <p className="text-xs text-neutral-500">Gula tambahan sekitar {meal.sugar_g} g.</p>}

      {analysis.components.length > 0 && (
        <ul className="space-y-2.5 rounded-xl bg-neutral-50 p-3 text-xs dark:bg-neutral-800/60">
          <li className="pb-1 font-semibold text-neutral-500">{kcalEdit !== null || proteinEdit !== null ? "Rincian estimasi porsi (sebelum koreksi manual)" : "Rincian yang kamu makan"}</li>
          {meal.components.map((c, i) => {
            const scalable = analysis.components[i]?.role === "other";
            const scale = adjust.scales?.[i] ?? 1;
            return (
              <li key={i} className="space-y-1">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={`min-w-0 break-words text-neutral-600 dark:text-neutral-300 ${scale === 0 ? "line-through opacity-60" : ""}`}>
                    {c.name}
                    {c.grams > 0 && <span className="text-neutral-400"> · ±{c.grams} g</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-neutral-500">{c.calories} kcal · {c.protein_g} g protein</span>
                </div>
                {scalable && (
                  <div className="flex items-center justify-end gap-1">
                    <span className="mr-1 text-neutral-400">Jumlah</span>
                    <button type="button" aria-label={`Kurangi ${c.name}`} disabled={scale <= 0} onClick={() => stepIngredient(i, -1)} className={stepper}>−</button>
                    <span className="w-9 text-center tabular-nums" aria-label={`Jumlah ${c.name}`}>×{scale.toLocaleString("id-ID")}</span>
                    <button type="button" aria-label={`Tambah ${c.name}`} disabled={scale >= 5} onClick={() => stepIngredient(i, 1)} className={stepper}>+</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {staple && (
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="text-neutral-500">
            {staple.name} di piring ≈ {(Math.max(0, staple.grams + adjust.stapleDeltaG) / CENTONG_G).toLocaleString("id-ID", { maximumFractionDigits: 1 })} centong
          </span>
          <span className="flex items-center gap-1">
            <button
              type="button"
              aria-label={`Kurangi ${staple.name}`}
              disabled={staple.grams + adjust.stapleDeltaG - STAPLE_STEP_G < 0}
              onClick={() => change({ stapleDeltaG: adjust.stapleDeltaG - STAPLE_STEP_G })}
              className="h-9 w-9 rounded-lg border border-neutral-300 text-lg disabled:opacity-30 dark:border-neutral-700"
            >
              −
            </button>
            <button
              type="button"
              aria-label={`Tambah ${staple.name}`}
              disabled={staple.grams + adjust.stapleDeltaG + STAPLE_STEP_G > 800}
              onClick={() => change({ stapleDeltaG: adjust.stapleDeltaG + STAPLE_STEP_G })}
              className="h-9 w-9 rounded-lg border border-neutral-300 text-lg disabled:opacity-30 dark:border-neutral-700"
            >
              +
            </button>
          </span>
        </div>
      )}

      {hasOil(analysis) && (
        <Segmented<OilLevel>
          label="Minyak / saus"
          value={adjust.oil}
          onChange={(oil) => change({ oil })}
          options={[["less", "Sedikit"], ["normal", "Biasa"], ["more", "Banyak"]]}
        />
      )}

      <Segmented<`${EatenFraction}`>
        label="Yang kamu makan"
        value={`${adjust.eaten}`}
        onChange={(v) => change({ eaten: Number(v) as EatenFraction })}
        options={[["1", "Habis"], ["0.75", "¾"], ["0.5", "½"], ["0.25", "¼"]]}
      />

      <div className="space-y-1.5 rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
        <label className="block text-xs font-medium text-neutral-600 dark:text-neutral-300" htmlFor={`${idPrefix}-note`}>Keterangan untuk AI (opsional)</label>
        <div className="flex gap-2">
          <input
            id={`${idPrefix}-note`}
            value={note}
            maxLength={MAX_MEAL_NOTE_LENGTH}
            onChange={(e) => { props.onNote(e.target.value); setRefined(false); }}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void refine(); } }}
            placeholder="Mis. telur 3 butir, minyak sedikit"
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
          <button type="button" onClick={() => void refine()} disabled={!note.trim() || refining} className="shrink-0 rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {refining ? "Menghitung…" : "Hitung ulang"}
          </button>
        </div>
        <p className="text-xs leading-relaxed text-neutral-500">Hal yang tidak terlihat di foto, seperti jumlah telur. AI menghitung ulang bahannya dari keterangan ini, tanpa foto. Pengaturan di atas diulang dari awal.</p>
        {refined && <p role="status" className="text-xs font-medium text-brand-700 dark:text-brand-300">Sudah dihitung ulang. Cek angkanya di atas.</p>}
        {refineError && <p role="alert" className="text-xs text-red-600 dark:text-red-300">{refineError}</p>}
      </div>

      <MealTimeField value={time} onChange={props.onTime} timezone={timezone} />
    </div>
  );
}
