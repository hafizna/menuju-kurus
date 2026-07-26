"use client";

import { useEffect, useState } from "react";

interface DayTrend {
  date: string;
  caloriesIn: number;
  caloriesOut: number;
  net: number;
  target: number;
  onTrack: boolean;
  hasData: boolean;
  plan?: string;
  challengeDone: boolean;
}

interface TrendsResponse {
  days: DayTrend[];
  successRate: number;
  streak: number;
}

interface WeeklyReview {
  weightChange: number | null;
  avgCalories: number;
  avgProtein: number;
  successRate: number;
  bestDay: { date: string; net: number } | null;
  worstDay: { date: string; net: number } | null;
  recommendationFlags: string[];
}

interface WeeklyReviewResponse {
  review: WeeklyReview;
  flags: { id: string; label: string }[];
}

export default function TrendsPage() {
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [weekly, setWeekly] = useState<WeeklyReviewResponse | null>(null);

  useEffect(() => {
    fetch("/api/trends")
      .then((r) => r.json())
      .then(setData);
    fetch("/api/weekly-review")
      .then((r) => r.json())
      .then(setWeekly);
  }, []);

  if (!data) return <div className="p-6 text-center text-neutral-400">Memuat...</div>;

  const maxVal = Math.max(...data.days.map((d) => Math.max(d.net, d.target)), 1);

  return (
    <div className="space-y-4 p-4">
      <h1 className="pt-2 text-xl font-bold">📈 Tren 14 Hari</h1>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl bg-white p-4 text-center shadow-sm dark:bg-neutral-900">
          <div className="text-2xl font-bold text-brand-600">{data.successRate}%</div>
          <div className="text-xs text-neutral-500">Success rate</div>
        </div>
        <div className="rounded-2xl bg-white p-4 text-center shadow-sm dark:bg-neutral-900">
          <div className="text-2xl font-bold text-orange-600">🔥 {data.streak}</div>
          <div className="text-xs text-neutral-500">Hari streak</div>
        </div>
      </div>

      {weekly && (
        <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
          <div className="text-sm font-medium">📋 Ringkasan Minggu Ini</div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <div className="text-neutral-500">Perubahan berat</div>
              <div className="font-semibold">
                {weekly.review.weightChange !== null
                  ? `${weekly.review.weightChange > 0 ? "+" : ""}${weekly.review.weightChange} kg`
                  : "belum cukup data"}
              </div>
            </div>
            <div>
              <div className="text-neutral-500">Rata-rata kalori</div>
              <div className="font-semibold">{weekly.review.avgCalories} kcal</div>
            </div>
            <div>
              <div className="text-neutral-500">Rata-rata protein</div>
              <div className="font-semibold">{weekly.review.avgProtein} g</div>
            </div>
            <div>
              <div className="text-neutral-500">Success rate</div>
              <div className="font-semibold">{weekly.review.successRate}%</div>
            </div>
          </div>
          {(weekly.review.bestDay || weekly.review.worstDay) && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {weekly.review.bestDay && (
                <div>
                  <div className="text-neutral-500">Hari terbaik</div>
                  <div className="font-semibold text-brand-600">
                    {weekly.review.bestDay.date.slice(5)} · {weekly.review.bestDay.net} kcal
                  </div>
                </div>
              )}
              {weekly.review.worstDay && (
                <div>
                  <div className="text-neutral-500">Hari terberat</div>
                  <div className="font-semibold text-red-500">
                    {weekly.review.worstDay.date.slice(5)} · {weekly.review.worstDay.net} kcal
                  </div>
                </div>
              )}
            </div>
          )}
          {weekly.flags.length > 0 && (
            <ul className="space-y-1 border-t border-neutral-100 pt-3 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">
              {weekly.flags.map((f) => (
                <li key={f.id}>💡 {f.label}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <div className="mb-3 text-sm font-medium">Kalori bersih vs target</div>
        <div className="flex h-40 items-end gap-1">
          {data.days.map((d) => {
            const heightPct = d.hasData ? Math.min(100, (Math.max(d.net, 0) / maxVal) * 100) : 4;
            const targetPct = Math.min(100, (d.target / maxVal) * 100);
            return (
              <div key={d.date} className="relative flex flex-1 flex-col items-center justify-end">
                <div
                  className="absolute w-full border-t border-dashed border-neutral-300 dark:border-neutral-700"
                  style={{ bottom: `${targetPct}%` }}
                />
                <div
                  className={`w-full rounded-t ${
                    !d.hasData ? "bg-neutral-100 dark:bg-neutral-800" : d.onTrack ? "bg-brand-500" : "bg-red-400"
                  }`}
                  style={{ height: `${heightPct}%` }}
                  title={`${d.date}: ${d.net} kcal`}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
          <span>{data.days[0]?.date.slice(5)}</span>
          <span>{data.days[data.days.length - 1]?.date.slice(5)}</span>
        </div>
      </section>

      <section className="space-y-2">
        {data.days
          .slice()
          .reverse()
          .filter((d) => d.hasData)
          .map((d) => (
            <div
              key={d.date}
              className="flex items-center justify-between rounded-xl bg-white px-4 py-2 text-sm shadow-sm dark:bg-neutral-900"
            >
              <span className="text-neutral-500">{d.date}</span>
              <span className="flex items-center gap-2">
                {d.challengeDone && "🎯"}
                {d.plan === "if" ? "⏱️" : d.plan === "deficit" ? "🍽️" : ""}
                <b className={d.onTrack ? "text-brand-600" : "text-red-500"}>{d.net} kcal</b>
              </span>
            </div>
          ))}
      </section>
    </div>
  );
}
