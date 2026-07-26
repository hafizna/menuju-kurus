"use client";

import type { WeightEntry } from "@/lib/types";

// Plain inline SVG, no chart library — keeps the bundle light.
export default function WeightChart({ entries }: { entries: WeightEntry[] }) {
  const recent = entries.slice(-30); // last 30 logged entries
  if (recent.length < 2) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-neutral-400">
        Butuh minimal 2 catatan berat untuk lihat grafik
      </div>
    );
  }

  const width = 320;
  const height = 140;
  const padX = 8;
  const padY = 12;

  const weights = recent.map((e) => e.weightKg);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const range = max - min || 1;

  const xFor = (i: number) => padX + (i / (recent.length - 1)) * (width - padX * 2);
  const yFor = (w: number) => padY + (1 - (w - min) / range) * (height - padY * 2);

  const rawPoints = recent.map((e, i) => `${xFor(i)},${yFor(e.weightKg)}`).join(" ");

  // 7-entry moving average for a smoother trend line.
  const movingAvg = recent.map((_, i) => {
    const windowSlice = recent.slice(Math.max(0, i - 6), i + 1);
    const avg = windowSlice.reduce((s, e) => s + e.weightKg, 0) / windowSlice.length;
    return avg;
  });
  const avgPoints = movingAvg.map((w, i) => `${xFor(i)},${yFor(w)}`).join(" ");

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Grafik tren berat badan">
      <polyline points={rawPoints} fill="none" stroke="currentColor" strokeWidth="1" className="text-neutral-300 dark:text-neutral-700" />
      <polyline points={avgPoints} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-brand-500" />
      {recent.map((e, i) => (
        <circle key={e.id} cx={xFor(i)} cy={yFor(e.weightKg)} r="2" className="fill-neutral-300 dark:fill-neutral-700" />
      ))}
    </svg>
  );
}
