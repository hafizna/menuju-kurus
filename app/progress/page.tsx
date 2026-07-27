"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { IconScale, IconActivity, IconCalendarCheck } from "@/components/icons";
import WeightTab from "@/components/progress/WeightTab";
import FitnessTab from "@/components/progress/FitnessTab";
import WeeklyTab from "@/components/progress/WeeklyTab";

type Tab = "weight" | "fitness" | "weekly";

const TABS: { id: Tab; label: string; icon: (props: { className?: string }) => JSX.Element }[] = [
  { id: "weight", label: "Berat", icon: IconScale },
  { id: "fitness", label: "Fitness", icon: IconActivity },
  { id: "weekly", label: "Mingguan", icon: IconCalendarCheck },
];

interface Summary {
  streak: number;
  healthScore: { total: number };
  weightTrend: { today: number | null };
}

function ProgressContent() {
  const searchParams = useSearchParams();
  const initialTab = TABS.find((t) => t.id === searchParams.get("tab"))?.id ?? "weight";
  const [tab, setTab] = useState<Tab>(initialTab);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    fetch("/api/today")
      .then((r) => r.json())
      .then((d) => setSummary({ streak: d.streak, healthScore: d.healthScore, weightTrend: d.weightTrend }));
  }, []);

  return (
    <div className="space-y-4 p-4">
      <header className="pt-2">
        <h1 className="text-xl font-bold">Progress</h1>
        <p className="text-sm text-neutral-500">Tren berat, fitness, dan evaluasi mingguan.</p>
      </header>

      {summary && (
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-white p-3 text-center shadow-sm dark:bg-neutral-900">
            <div className="text-lg font-bold">{summary.healthScore.total}</div>
            <div className="text-xs text-neutral-500">Health Score</div>
          </div>
          <div className="rounded-2xl bg-white p-3 text-center shadow-sm dark:bg-neutral-900">
            <div className="text-lg font-bold text-orange-600">🔥 {summary.streak}</div>
            <div className="text-xs text-neutral-500">Streak</div>
          </div>
          <div className="rounded-2xl bg-white p-3 text-center shadow-sm dark:bg-neutral-900">
            <div className="text-lg font-bold">{summary.weightTrend.today !== null ? `${summary.weightTrend.today} kg` : "-"}</div>
            <div className="text-xs text-neutral-500">Berat</div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-3 gap-1 rounded-2xl bg-neutral-100 p-1 dark:bg-neutral-900">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex flex-col items-center gap-1 rounded-xl py-2 text-xs font-medium transition-colors ${
              tab === id ? "bg-white text-brand-700 shadow-sm dark:bg-neutral-800 dark:text-brand-400" : "text-neutral-500"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {tab === "weight" && <WeightTab />}
      {tab === "fitness" && <FitnessTab />}
      {tab === "weekly" && <WeeklyTab />}
    </div>
  );
}

export default function ProgressPage() {
  return (
    <Suspense>
      <ProgressContent />
    </Suspense>
  );
}
