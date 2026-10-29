"use client";

import { useEffect, useState } from "react";
import { describeCalories, describeProtein, type DayRecap as Recap } from "@/lib/dayRecap";

const RINGS = [
  { radius: 48, stroke: 10 },
  { radius: 34, stroke: 10 },
] as const;

function Ring({ name, radius, stroke, fill, overflow = 0, ready, bar }: { name: string; radius: number; stroke: number; fill: number; overflow?: number; ready: boolean; bar: string }) {
  const circumference = 2 * Math.PI * radius;
  const arc = (share: number) => (ready ? circumference * (1 - share) : circumference);
  return (
    <>
      <circle cx="56" cy="56" r={radius} fill="none" strokeWidth={stroke} className="stroke-neutral-200" />
      <circle
        data-ring={name}
        cx="56" cy="56" r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round"
        strokeDasharray={circumference} strokeDashoffset={arc(fill)}
        className={`day-ring ${bar} ${fill <= 0 ? "opacity-0" : ""}`}
      />
      {/* Past the target the ring goes round a second time, in red, over the first lap. */}
      {overflow > 0 && (
        <circle
          data-ring={`${name}-over`}
          cx="56" cy="56" r={radius} fill="none" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference} strokeDashoffset={arc(overflow)}
          className="day-ring stroke-red-600"
        />
      )}
    </>
  );
}

interface Props {
  recap: Recap;
  open: boolean;
  onToggle: () => void;
  /** Id of the list this card opens. */
  controls: string;
  isToday: boolean;
  completing: boolean;
  completeError: string;
  onComplete: () => void;
}

// A day in two rings, like the activity rings on a watch: calories outside,
// protein inside. The card is the button that opens the day's meals below it.
export default function DayRecap({ recap, open, onToggle, controls, isToday, completing, completeError, onComplete }: Props) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const kcal = describeCalories(recap);
  const protein = describeProtein(recap);
  const over = recap.kcalState === "over";
  const day = isToday ? "hari ini" : "hari itu";
  const things = [
    `${recap.mealCount} makanan`,
    recap.activityCount > 0 ? `${recap.caloriesOut.toLocaleString("id-ID")} kcal terbakar` : "",
  ].filter(Boolean).join(" · ");

  return (
    <div className="rounded-2xl border border-neutral-100 bg-white shadow-xs">
      <button type="button" aria-expanded={open} aria-controls={controls} onClick={onToggle} className="block w-full rounded-2xl p-4 text-left">
        <span className="flex items-center gap-4">
          <svg viewBox="0 0 112 112" className="h-24 w-24 shrink-0 -rotate-90" aria-hidden="true">
            <Ring name="calories" {...RINGS[0]} fill={recap.kcalFill} overflow={recap.kcalOverflow} ready={ready} bar="stroke-brand-600" />
            <Ring name="protein" {...RINGS[1]} fill={recap.proteinFill} ready={ready} bar="stroke-sky-500" />
          </svg>
          <span className="min-w-0 flex-1 space-y-2.5">
            <span className="block">
              <span className="flex items-center gap-1.5 text-xs text-neutral-500"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-brand-600" />Kalori</span>
              <span className="mt-0.5 block text-sm font-semibold tabular-nums">{recap.caloriesIn.toLocaleString("id-ID")} / {recap.kcalTarget.toLocaleString("id-ID")} kcal</span>
              <span className={`block text-xs ${over ? "text-red-700" : "text-neutral-500"}`}>{kcal.headline}{kcal.detail && ` · ${kcal.detail}`}</span>
            </span>
            <span className="block">
              <span className="flex items-center gap-1.5 text-xs text-neutral-500"><span aria-hidden="true" className="h-2 w-2 rounded-full bg-sky-500" />Protein</span>
              <span className="mt-0.5 block text-sm font-semibold tabular-nums">{recap.proteinG.toLocaleString("id-ID")} / {recap.proteinTarget.toLocaleString("id-ID")} g</span>
              <span className="block text-xs text-neutral-500">{protein.headline}{protein.detail && ` · ${protein.detail}`}</span>
            </span>
          </span>
        </span>
        <span className="mt-3 flex items-center justify-between gap-3 border-t border-neutral-100 pt-3 text-xs text-neutral-500">
          <span className="min-w-0">{things}</span>
          <span className="flex shrink-0 items-center gap-1 font-semibold text-brand-700">
            {open ? "Tutup rincian" : "Lihat per makanan"}
            <svg aria-hidden="true" viewBox="0 0 12 12" className={`h-3 w-3 transition-transform ${open ? "rotate-180" : ""}`}>
              <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </span>
      </button>

      {(recap.proteinUnknown > 0 || (recap.status !== "complete" && recap.mealCount > 0)) && (
        <div className="space-y-2 border-t border-neutral-100 px-4 py-3 text-xs text-neutral-500">
          {recap.proteinUnknown > 0 && <p>{recap.proteinUnknown} makanan dicatat manual tanpa protein, jadi protein bisa lebih tinggi dari angka ini.</p>}
          {recap.status !== "complete" && recap.mealCount > 0 && (
            <div className="flex items-center justify-between gap-3">
              <p>Catatan {day} belum ditandai lengkap, jadi angkanya masih sementara.</p>
              <button type="button" onClick={onComplete} disabled={completing} className="shrink-0 rounded-lg border border-brand-600 px-3 py-2 font-semibold text-brand-700 disabled:opacity-50">
                {completing ? "Menyimpan…" : "Tandai lengkap"}
              </button>
            </div>
          )}
          {completeError && <p role="alert" className="text-red-600">{completeError}</p>}
        </div>
      )}
    </div>
  );
}
