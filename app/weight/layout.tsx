"use client";

import { useEffect, useState } from "react";
import type { WeightTrend } from "@/lib/weight";
import WeightForecastCard from "@/components/WeightForecastCard";

export default function WeightLayout({ children }: { children: React.ReactNode }) {
  const [trend, setTrend] = useState<WeightTrend | null>(null);

  useEffect(() => {
    fetch("/api/weight")
      .then((r) => r.json())
      .then((d) => setTrend(d.trend ?? null));
  }, []);

  return (
    <>
      {children}
      {trend && (
        <div className="px-4 pb-4">
          <WeightForecastCard trend={trend} />
        </div>
      )}
    </>
  );
}
