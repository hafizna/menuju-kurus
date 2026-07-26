"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Analysis {
  foodName: string;
  calories: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  portionNote: string;
  confidence: "low" | "medium" | "high";
}

export default function LogFoodPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Analysis | null>(null);
  const [portion, setPortion] = useState(1);
  const [saving, setSaving] = useState(false);

  async function handleFile(file: File) {
    setError("");
    setResult(null);
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
      router.push("/");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <h1 className="pt-2 text-xl font-bold">📷 Foto Makanan</h1>

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

      {!preview && (
        <button
          onClick={() => fileRef.current?.click()}
          className="block w-full rounded-xl border-2 border-dashed border-brand-400 px-4 py-10 text-center font-medium text-brand-600 dark:text-brand-400"
        >
          Ambil / pilih foto makanan
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
            <label className="mb-1 block text-xs text-neutral-500">
              Porsi sebenarnya: {portion}x
            </label>
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
