"use client";

import Link from "next/link";
import type { AdaptiveCoachResult, CoachMoment } from "@/lib/adaptiveCoach";
import { IconSparkle } from "@/components/icons";

const MOMENTS: Array<{ value: CoachMoment; label: string }> = [
  { value: "neutral", label: "Sekarang" },
  { value: "hungry", label: "Lapar" },
  { value: "very_hungry", label: "Sangat lapar" },
  { value: "craving", label: "Craving" },
  { value: "eating_out", label: "Makan di luar" },
];

function confidenceLabel(value: AdaptiveCoachResult["confidence"]): string {
  if (value === "high") return "Personalisasi tinggi";
  if (value === "medium") return "Personalisasi sedang";
  return "Personalisasi awal";
}

export default function DailyCoach({
  coach,
  moment,
  onMomentChange,
}: {
  coach: AdaptiveCoachResult;
  moment: CoachMoment;
  onMomentChange: (moment: CoachMoment) => void;
}) {
  const tone =
    coach.status === "recover"
      ? "border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/40"
      : coach.status === "watch"
        ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40"
        : "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950/40";

  return (
    <section className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <IconSparkle className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
          <div>
            <div className="text-sm font-semibold">Personal Adaptive Coach</div>
            <div className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-300">{coach.headline}</div>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white/70 px-2 py-1 text-[10px] font-medium text-neutral-500 dark:bg-neutral-900/60">
          {confidenceLabel(coach.confidence)}
        </span>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-[11px] font-medium text-neutral-500">Kondisimu sekarang</div>
        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {MOMENTS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onMomentChange(item.value)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                moment === item.value
                  ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
                  : "bg-white/70 text-neutral-600 dark:bg-neutral-900/60 dark:text-neutral-300"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-4 space-y-3">
        {coach.recommendations.map((item) => (
          <li key={item.id} className="border-l-2 border-neutral-300 pl-3 dark:border-neutral-700">
            <div className="text-sm font-medium">{item.title}</div>
            <div className="mt-0.5 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">{item.detail}</div>
            <div className="mt-1 text-[11px] text-neutral-500">Dasar: {item.evidence}</div>
            {item.href && item.actionLabel && (
              <Link href={item.href} className="mt-2 inline-flex rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 shadow-sm dark:bg-neutral-900 dark:text-brand-300">
                {item.actionLabel} →
              </Link>
            )}
          </li>
        ))}
      </ul>

      <p className="mt-3 border-t border-black/5 pt-2 text-[10px] text-neutral-500 dark:border-white/10">
        Berdasarkan {coach.basis.join(", ")}. AI tidak menentukan prioritas ini.
      </p>
    </section>
  );
}
