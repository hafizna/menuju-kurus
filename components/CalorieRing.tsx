"use client";

import { useEffect, useState } from "react";

// Ring fills as food is logged; it animates in from empty on first paint.
export default function CalorieRing({
  eaten,
  target,
  className,
}: {
  eaten: number;
  target: number;
  className?: string;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const radius = 70;
  const circumference = 2 * Math.PI * radius;
  const ratio = target > 0 ? Math.min(1, Math.max(0, eaten / target)) : 0;
  const over = eaten > target;
  const left = Math.abs(target - eaten);

  return (
    <div className={`relative ${className ?? ""}`}>
      <svg viewBox="0 0 168 168" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="84" cy="84" r={radius} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="14" />
        <circle
          cx="84"
          cy="84"
          r={radius}
          fill="none"
          stroke={over ? "#fbbf24" : "#ffffff"}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={ready ? circumference * (1 - ratio) : circumference}
          style={{ transition: "stroke-dashoffset 900ms cubic-bezier(0.22, 1, 0.36, 1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <div className="font-display text-4xl font-bold tabular-nums leading-none">
          {left.toLocaleString("id-ID")}
        </div>
        <div className="mt-1 text-xs text-white/80">{over ? "kcal melebihi target" : "kcal tersisa"}</div>
      </div>
    </div>
  );
}
