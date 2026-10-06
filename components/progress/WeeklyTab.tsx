"use client";

import { useCallback, useEffect, useState } from "react";
import { IconSparkle } from "@/components/icons";

interface DayTrend {
  date: string;
  caloriesIn: number;
  caloriesOut: number;
  net: number;
  target: number;
  onTrack: boolean;
  hasData: boolean;
  foodLogStatus: "empty" | "partial" | "complete";
  plan?: string;
  challengeDone: boolean;
}

interface TrendsResponse {
  days: DayTrend[];
  successRate: number | null;
  streak: number;
}

interface WeeklyReview {
  weightChange: number | null;
  avgCalories: number | null;
  avgProtein: number | null;
  completedDays: number;
  totalDays: number;
  successRate: number | null;
  bestDay: { date: string; caloriesIn: number } | null;
  worstDay: { date: string; caloriesIn: number } | null;
  recommendationFlags: string[];
}

interface WeeklyReviewResponse {
  review: WeeklyReview;
  flags: { id: string; label: string }[];
}

interface AiSummary {
  summary: string;
  recommendations: string[];
  generatedAt: string;
  source: "ai" | "template";
}

export default function WeeklyTab() {
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [weekly, setWeekly] = useState<WeeklyReviewResponse | null>(null);
  const [aiSummary, setAiSummary] = useState<AiSummary | null>(null);
  const [generating, setGenerating] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [loadError, setLoadError] = useState("");
  const [aiError, setAiError] = useState("");

  const loadReview = useCallback(async () => {
    setLoadError("");
    try {
      const [trendsResponse, reviewResponse] = await Promise.all([
        fetch("/api/trends"), fetch("/api/weekly-review"),
      ]);
      if (!trendsResponse.ok || !reviewResponse.ok) throw new Error("Ringkasan belum dapat dimuat. Periksa koneksi dan konfigurasi database.");
      setData(await trendsResponse.json());
      setWeekly(await reviewResponse.json());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Gagal memuat ringkasan.");
    }
  }, []);

  useEffect(() => {
    void loadReview();
    fetch("/api/weekly-summary")
      .then((response) => {
        if (!response.ok) throw new Error("Ringkasan AI tersimpan belum dapat dimuat.");
        return response.json();
      })
      .then((result) => setAiSummary(result.summary))
      .catch((error) => setAiError(error instanceof Error ? error.message : "Gagal memuat ringkasan AI."));
  }, [loadReview]);

  async function setFoodLogComplete(date: string, complete: boolean) {
    setSavingDate(date);
    setCompletionError("");
    try {
      const response = await fetch("/api/log", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date, foodLogComplete: complete }),
      });
      if (!response.ok) throw new Error("Status belum tersimpan. Coba lagi.");
      const [trendsResponse, reviewResponse] = await Promise.all([
        fetch("/api/trends"), fetch("/api/weekly-review"),
      ]);
      if (!trendsResponse.ok || !reviewResponse.ok) throw new Error("Status tersimpan, tetapi ringkasan belum dimuat ulang.");
      setData(await trendsResponse.json());
      setWeekly(await reviewResponse.json());
    } catch (error) {
      setCompletionError(error instanceof Error ? error.message : "Gagal menyimpan status.");
    } finally {
      setSavingDate(null);
    }
  }

  async function generateSummary() {
    setGenerating(true);
    setAiError("");
    try {
      const res = await fetch("/api/weekly-summary", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat ringkasan");
      setAiSummary(data.summary);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Gagal membuat ringkasan");
    } finally {
      setGenerating(false);
    }
  }

  if (!data) return loadError ? (
    <div className="space-y-3 p-4">
      <p role="alert" className="text-sm text-red-500">{loadError}</p>
      <button type="button" onClick={() => void loadReview()} className="rounded-lg border border-neutral-300 px-3 py-2 text-sm">Coba lagi</button>
    </div>
  ) : <div className="p-6 text-center text-neutral-400">Memuat...</div>;

  const maxVal = Math.max(...data.days.map((d) => Math.max(d.caloriesIn, d.target)), 1);

  return (
    <div className="space-y-4">
      {loadError && <p role="alert" className="text-sm text-red-500">{loadError}</p>}
      {weekly && (
        <section className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="text-sm font-semibold">Ringkasan Minggu Ini</div>
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
              <div className="font-semibold">{weekly.review.avgCalories === null ? "Belum ada hari lengkap" : `${weekly.review.avgCalories} kcal`}</div>
            </div>
            <div>
              <div className="text-neutral-500">Rata-rata protein</div>
              <div className="font-semibold">{weekly.review.avgProtein === null ? "Belum ada hari lengkap" : `${weekly.review.avgProtein} g`}</div>
            </div>
            <div>
              <div className="text-neutral-500">Dalam rentang feedback</div>
              <div className="font-semibold">{weekly.review.successRate === null ? "Belum cukup data" : `${weekly.review.successRate}%`}</div>
            </div>
          </div>
          <p className="text-xs text-neutral-500">Rata-rata dari {weekly.review.completedDays}/{weekly.review.totalDays} hari lengkap. Rentang feedback 80–100% target merupakan heuristik, bukan batas kecukupan medis.</p>
          {(weekly.review.bestDay || weekly.review.worstDay) && (
            <div className="grid grid-cols-2 gap-3 text-sm">
              {weekly.review.bestDay && (
                <div>
                  <div className="text-neutral-500">Paling dekat target</div>
                  <div className="font-semibold text-brand-600">
                    {weekly.review.bestDay.date.slice(5)} · {weekly.review.bestDay.caloriesIn} kcal
                  </div>
                </div>
              )}
              {weekly.review.worstDay && (
                <div>
                  <div className="text-neutral-500">Paling jauh dari target</div>
                  <div className="font-semibold text-red-500">
                    {weekly.review.worstDay.date.slice(5)} · {weekly.review.worstDay.caloriesIn} kcal
                  </div>
                </div>
              )}
            </div>
          )}
          {weekly.flags.length > 0 && (
            <ul className="space-y-1.5 border-t border-neutral-100 pt-3 text-sm text-neutral-600 dark:border-neutral-800 dark:text-neutral-300">
              {weekly.flags.map((f) => (
                <li key={f.id} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                  {f.label}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <IconSparkle className="h-4 w-4 text-brand-600 dark:text-brand-400" />
            {aiSummary?.source === "template" ? "Ringkasan Otomatis" : "Ringkasan AI"}
          </div>
          <button
            onClick={generateSummary}
            disabled={generating}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {generating ? "Membuat..." : aiSummary ? "Buat ulang" : "Buat ringkasan"}
          </button>
        </div>

        {aiError && <p className="text-sm text-red-500">{aiError}</p>}

        {aiSummary?.source === "template" && (
          <p className="text-xs text-neutral-400">
            Dibuat dari data langsung tanpa AI (DeepSeek belum diaktifkan) — tetap gratis.
          </p>
        )}

        {aiSummary ? (
          <>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">{aiSummary.summary}</p>
            <ul className="space-y-1.5 text-sm text-neutral-600 dark:text-neutral-300">
              {aiSummary.recommendations.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                  {r}
                </li>
              ))}
            </ul>
            <p className="text-xs text-neutral-400">
              Dibuat{" "}
              {new Date(aiSummary.generatedAt).toLocaleString("id-ID", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </p>
          </>
        ) : (
          !generating && <p className="text-sm text-neutral-400">Belum ada ringkasan minggu ini.</p>
        )}
      </section>

      <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-3 text-sm font-medium">Asupan tercatat vs target</div>
        <div className="flex h-40 items-end gap-1">
          {data.days.map((d) => {
            const heightPct = d.hasData ? Math.min(100, (Math.max(d.caloriesIn, 0) / maxVal) * 100) : 4;
            const targetPct = Math.min(100, (d.target / maxVal) * 100);
            return (
              <div key={d.date} className="relative flex h-full flex-1 flex-col items-center justify-end">
                <div
                  className="absolute w-full border-t border-dashed border-neutral-300 dark:border-neutral-700"
                  style={{ bottom: `${targetPct}%` }}
                />
                <div
                  className={`w-full rounded-t ${
                    !d.hasData ? "bg-neutral-100 dark:bg-neutral-800" : d.foodLogStatus !== "complete" ? "bg-neutral-400" : "bg-brand-500"
                  }`}
                  style={{ height: `${heightPct}%` }}
                  title={`${d.date}: ${d.hasData ? `${d.caloriesIn} kcal` : "belum ada catatan"} · ${d.foodLogStatus}`}
                />
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-neutral-500">Abu-abu: parsial atau belum dicatat. Hijau: catatan lengkap, bukan penilaian keberhasilan diet. Aktivitas tidak dikurangkan dari asupan.</p>
        <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
          <span>{data.days[0]?.date.slice(5)}</span>
          <span>{data.days[data.days.length - 1]?.date.slice(5)}</span>
        </div>
      </section>

      {completionError && <p role="alert" className="text-sm text-red-500">{completionError}</p>}
      <section className="space-y-2">
        {data.days
          .slice()
          .reverse()
          .map((d) => (
            <div key={d.date} className="rounded-xl border border-neutral-100 bg-white px-4 py-3 text-sm shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">{d.date}</span>
                <b>{d.hasData ? `${d.caloriesIn} kcal` : "Belum dicatat"}</b>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{d.foodLogStatus === "complete" ? "Lengkap" : d.foodLogStatus === "partial" ? "Parsial" : "Belum ada catatan makan"}</p>
              <button type="button" disabled={savingDate !== null} onClick={() => setFoodLogComplete(d.date, d.foodLogStatus !== "complete")} className="mt-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs disabled:opacity-50 dark:border-neutral-700">
                {savingDate === d.date ? "Menyimpan..." : d.foodLogStatus === "complete" ? "Buka kembali catatan" : "Semua asupan tanggal ini sudah dicatat"}
              </button>
            </div>
          ))}
      </section>
    </div>
  );
}
