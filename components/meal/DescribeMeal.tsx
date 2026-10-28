"use client";

import { useEffect, useRef, useState } from "react";
import KukangLoader from "@/components/KukangLoader";
import type { FoodAnalysis } from "@/lib/gemini";
import { MAX_MEAL_DESCRIPTION_LENGTH } from "@/lib/mealNote";
import { PORTION_UNITS } from "@/lib/portionUnits";

interface Props {
  text: string;
  onText: (value: string) => void;
  /** The estimate is ready; the parent takes over with the usual review. */
  onEstimated: (analysis: FoodAnalysis) => void;
}

// A meal with no photo: the person writes what and how much, in household
// measures, and the AI turns it into the same ingredient breakdown a photo gives.
export default function DescribeMeal({ text, onText, onEstimated }: Props) {
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  function add(phrase: string) {
    const base = text.trimEnd().replace(/,$/, "");
    const next = base ? `${base}, ${phrase}` : phrase;
    if (next.length <= MAX_MEAL_DESCRIPTION_LENGTH) onText(next);
  }

  async function calculate() {
    const written = text.trim();
    if (calculating) return;
    if (written.length < 3) { setError("Tulis dulu apa yang kamu makan, misalnya nasi 1 centong dan telur 2 butir."); return; }
    setCalculating(true); setError("");
    try {
      const response = await fetch("/api/estimate-meal", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: written }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.analysis) throw new Error(data.error || "Belum bisa dihitung. Coba lagi atau isi manual.");
      if (alive.current) onEstimated(data.analysis as FoodAnalysis);
    } catch (cause) {
      if (alive.current) setError(cause instanceof Error ? cause.message : "Belum bisa dihitung. Coba lagi atau isi manual.");
    } finally {
      if (alive.current) setCalculating(false);
    }
  }

  return (
    <section aria-label="Tulis dan hitung" className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      <div>
        <h2 className="font-semibold">Tulis &amp; hitung makananmu</h2>
        <p className="mt-1 text-xs text-neutral-500">Tulis apa yang kamu makan dan berapa banyak. AI menghitungnya dengan ukuran baku yang sama untuk semua orang, lalu kamu cek dan koreksi.</p>
      </div>

      {calculating ? (
        <KukangLoader size="section" label="Menghitung makananmu..." />
      ) : (
        <>
          <label className="block text-xs text-neutral-500" htmlFor="describe-text">Apa yang kamu makan dan ukurannya
            <textarea
              id="describe-text"
              rows={4}
              value={text}
              maxLength={MAX_MEAL_DESCRIPTION_LENGTH}
              onChange={(e) => { onText(e.target.value); setError(""); }}
              placeholder="Mis. nasi 1,5 centong, ayam goreng paha 1 potong, tempe 2 potong, teh manis 1 gelas"
              className="mt-1 w-full resize-none rounded-lg border border-neutral-300 px-3 py-2 text-sm leading-snug dark:border-neutral-700 dark:bg-neutral-800"
            />
          </label>

          <div>
            <p className="mb-1.5 text-xs text-neutral-500">Ketuk untuk menambahkan:</p>
            <div className="flex flex-wrap gap-1.5">
              {PORTION_UNITS.map((unit) => (
                <button key={unit.phrase} type="button" onClick={() => add(unit.phrase)} className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm active:scale-95 dark:border-neutral-700">
                  + {unit.phrase}
                </button>
              ))}
            </div>
          </div>

          <details className="rounded-xl bg-neutral-50 p-3 text-xs dark:bg-neutral-800/60">
            <summary className="cursor-pointer font-medium text-neutral-600 dark:text-neutral-300">Ukuran baku yang dipakai</summary>
            <ul className="mt-2 space-y-1 text-neutral-600 dark:text-neutral-300">
              {PORTION_UNITS.map((unit) => (
                <li key={unit.food}><span className="font-medium">{unit.food}:</span> {unit.unit} = {unit.size}</li>
              ))}
            </ul>
            <p className="mt-2 text-neutral-500">Kalau kamu tidak menulis jumlahnya, AI memakai satu porsi biasa dan menyebutkannya. Pakai angka dan satuan di atas supaya hasilnya tepat. Kalori satu centong nasi sama untuk siapa saja; targetmu sendiri yang menyesuaikan.</p>
          </details>

          {error && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{error}</p>}
          <button type="button" onClick={() => void calculate()} disabled={!text.trim()} className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-50">
            Hitung
          </button>
          <p className="text-xs text-neutral-500">Tulisanmu dikirim ke Gemini sebagai teks. Jangan menulis data pribadi di sini.</p>
        </>
      )}
    </section>
  );
}
