"use client";

import { useState } from "react";
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
  if (value === "high") return "Sudah kenal kamu";
  if (value === "medium") return "Mulai kenal kamu";
  return "Baru kenalan";
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
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? coach.recommendations : coach.recommendations.slice(0, 1);
  const hidden = coach.recommendations.length - shown.length;
  const tone =
    coach.status === "recover"
      ? "border-orange-200 bg-orange-50"
      : coach.status === "watch"
        ? "border-amber-200 bg-amber-50"
        : "border-emerald-200 bg-emerald-50";

  return (
    <section className={`rounded-2xl border p-4 ${tone}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2">
          <IconSparkle className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
          <div>
            <div className="text-sm font-semibold">Saran untukmu</div>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-white/70 px-2 py-1 text-xs font-medium text-neutral-500">
          {confidenceLabel(coach.confidence)}
        </span>
      </div>

      <div className="mt-3">
        <div className="mb-1.5 text-xs font-medium text-neutral-500">Lagi gimana sekarang?</div>
        <div className="no-scrollbar flex gap-1.5 overflow-x-auto pb-1">
          {MOMENTS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => onMomentChange(item.value)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                moment === item.value
                  ? "bg-neutral-900 text-white"
                  : "bg-white/70 text-neutral-600"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <ul className="mt-4 space-y-3">
        {shown.map((item) => (
          <li key={item.id} className="border-l-2 border-neutral-300 pl-3">
            <div className="text-sm font-medium">{item.title}</div>
            <div className="mt-0.5 text-xs leading-relaxed text-neutral-600">{item.detail}</div>
            <div className="mt-1 text-xs text-neutral-500">Dari data: {item.evidence}</div>
            {item.href && item.actionLabel && (
              <Link href={item.href} className="mt-2 inline-flex rounded-lg bg-white px-2.5 py-1.5 text-xs font-medium text-brand-700 shadow-xs">
                {item.actionLabel} →
              </Link>
            )}
          </li>
        ))}
      </ul>

      {(hidden > 0 || expanded) && coach.recommendations.length > 1 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-xs font-medium text-neutral-500 underline-offset-2 hover:underline"
        >
          {expanded ? "Sembunyikan saran lain" : `Lihat ${hidden} saran lain`}
        </button>
      )}

      <p className="mt-3 border-t border-black/5 pt-2 text-xs text-neutral-500">
        Berdasarkan {coach.basis.join(", ")}.
      </p>
    </section>
  );
}
