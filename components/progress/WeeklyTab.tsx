"use client";

import { useCallback, useEffect, useState } from "react";
import { IconSparkle } from "@/components/icons";
import WeeklyFocusCard from "@/components/WeeklyFocusCard";
import KukangLoader from "@/components/KukangLoader";
import type { WeeklyReview } from "@/lib/weeklyReview";
import type { StoredWeeklySummary } from "@/lib/weeklySummary";

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

interface WeeklyReviewResponse {
  review: WeeklyReview;
  flags: { id: string; label: string }[];
}

export default function WeeklyTab() {
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [weekly, setWeekly] = useState<WeeklyReviewResponse | null>(null);
  const [aiSummary, setAiSummary] = useState<StoredWeeklySummary | null>(null);
  const [summaryStale, setSummaryStale] = useState(false);
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
      if (!trendsResponse.ok || !reviewResponse.ok) throw new Error("Ringkasan belum dapat dimuat. Periksa koneksi lalu coba lagi.");
      setData(await trendsResponse.json());
      setWeekly(await reviewResponse.json());
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Gagal memuat ringkasan.");
    }
  }, []);

  const loadSummary = useCallback(async () => {
    setAiError("");
    try {
      const response = await fetch("/api/weekly-summary");
      if (!response.ok) throw new Error("Ringkasan tersimpan belum dapat diperiksa. Coba muat ulang.");
      const result = await response.json();
      setAiSummary(result.summary); setSummaryStale(result.stale === true);
    } catch (e) { setSummaryStale(true); setAiError(e instanceof Error ? e.message : "Gagal memuat ringkasan."); }
  }, []);
  useEffect(() => {
    const refresh = () => { void loadReview(); void loadSummary(); };
    refresh(); window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [loadReview, loadSummary]);

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
      setSummaryStale(true);
      const [trendsResponse, reviewResponse] = await Promise.all([
        fetch("/api/trends"), fetch("/api/weekly-review"),
      ]);
      if (!trendsResponse.ok || !reviewResponse.ok) throw new Error("Status tersimpan, tetapi ringkasan belum dimuat ulang.");
      setData(await trendsResponse.json());
      setWeekly(await reviewResponse.json());
      await loadSummary();
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
      setSummaryStale(data.stale === true);
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
  ) : <KukangLoader size="section" label="Memuat minggu ini..." />;

  const reviewDays = data.days.filter((day) => weekly?.review.periodStart && weekly.review.periodEnd
    ? day.date >= weekly.review.periodStart && day.date <= weekly.review.periodEnd
    : data.days.slice(-7).includes(day));
  const maxVal = Math.max(...reviewDays.map((d) => Math.max(d.caloriesIn, d.target)), 1);

  return (
    <div className="space-y-4">
      {loadError && <p role="alert" className="text-sm text-red-500">{loadError}</p>}
      {weekly && (
        <section className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs">
          <div className="text-sm font-semibold">Review 7 hari terakhir</div>
          <p className="text-xs text-neutral-500">{weekly.review.periodStart} — {weekly.review.periodEnd} · termasuk hari ini, yang masih bisa bertambah.</p>
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
          <dl className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-neutral-50 p-2"><dt>Di bawah rentang</dt><dd className="mt-1 font-semibold">{weekly.review.belowRangeDays} hari</dd></div>
            <div className="rounded-lg bg-neutral-50 p-2"><dt>Dalam rentang</dt><dd className="mt-1 font-semibold">{weekly.review.withinRangeDays} hari</dd></div>
            <div className="rounded-lg bg-neutral-50 p-2"><dt>Di atas target</dt><dd className="mt-1 font-semibold">{weekly.review.aboveRangeDays} hari</dd></div>
            <div className="rounded-lg bg-neutral-50 p-2"><dt>Belum lengkap</dt><dd className="mt-1 font-semibold">{weekly.review.incompleteDays} hari · belum dinilai</dd></div>
          </dl>
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
                  <div className="font-semibold text-neutral-600">
                    {weekly.review.worstDay.date.slice(5)} · {weekly.review.worstDay.caloriesIn} kcal
                  </div>
                </div>
              )}
            </div>
          )}
          {weekly.flags.length > 0 && (
            <ul className="space-y-1.5 border-t border-neutral-100 pt-3 text-sm text-neutral-600">
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

      <section className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <IconSparkle className="h-4 w-4 text-brand-600" />
            {aiSummary?.source === "template" ? "Ringkasan Otomatis" : aiSummary?.source === "ai" ? "Ringkasan AI" : "Rangkuman review"}
          </div>
          <button
            onClick={generateSummary}
            disabled={generating}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            {generating ? "Membuat..." : summaryStale ? "Perbarui ringkasan" : aiSummary ? "Buat ulang" : "Buat ringkasan"}
          </button>
        </div>

        {aiError && <div><p role="alert" className="text-sm text-red-500">{aiError}</p><button type="button" onClick={() => void loadSummary()} className="mt-2 rounded-lg border px-3 py-2 text-xs">Muat ulang ringkasan</button></div>}
        {aiSummary && <p className="text-xs text-neutral-500">Periode ringkasan: {aiSummary.periodStart} — {aiSummary.periodEnd}</p>}
        {aiSummary && summaryStale && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Catatan atau periode berubah sejak ringkasan ini dibuat. Perbarui ringkasan agar sesuai dengan angka terbaru.</p>}

        {aiSummary?.source === "template" && !summaryStale && (
          <p className="text-xs text-neutral-400">
            Rangkuman otomatis berdasarkan catatanmu.
          </p>
        )}

        {aiSummary && !summaryStale ? (
          <>
            <p className="text-sm text-neutral-600">{aiSummary.summary}</p>
            <ul className="space-y-1.5 text-sm text-neutral-600">
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
          !generating && !aiSummary && <p className="text-sm text-neutral-400">Buat ringkasan untuk periode 7 hari di atas.</p>
        )}
      </section>

      <WeeklyFocusCard editable />

      <details className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs">
      <summary className="cursor-pointer text-sm font-medium">Rincian per hari · grafik asupan dan status catatan</summary>
      <div className="mt-4 space-y-4">
      <section>
        <div className="mb-3 text-sm font-medium">Asupan tercatat vs target · periode review yang sama</div>
        <div className="flex h-40 items-end gap-1">
          {reviewDays.map((d) => {
            const heightPct = d.hasData ? Math.min(100, (Math.max(d.caloriesIn, 0) / maxVal) * 100) : 4;
            const targetPct = Math.min(100, (d.target / maxVal) * 100);
            return (
              <div key={d.date} className="relative flex h-full flex-1 flex-col items-center justify-end">
                <div
                  className="absolute w-full border-t border-dashed border-neutral-300"
                  style={{ bottom: `${targetPct}%` }}
                />
                <div
                  className={`w-full rounded-t ${
                    !d.hasData ? "bg-neutral-100" : d.foodLogStatus !== "complete" ? "bg-neutral-400" : "bg-brand-500"
                  }`}
                  style={{ height: `${heightPct}%` }}
                  title={`${d.date}: ${d.hasData ? `${d.caloriesIn} kcal` : "belum ada catatan"} · ${d.foodLogStatus}`}
                />
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-neutral-500">Abu-abu: parsial atau belum dicatat. Hijau: catatan lengkap, bukan penilaian keberhasilan diet. Aktivitas tidak dikurangkan dari asupan.</p>
        <div className="mt-1 flex justify-between text-xs text-neutral-400">
          <span>{reviewDays[0]?.date}</span>
          <span>{reviewDays[reviewDays.length - 1]?.date}</span>
        </div>
      </section>

      {completionError && <p role="alert" className="text-sm text-red-500">{completionError}</p>}
      <section className="space-y-2">
        {reviewDays
          .slice()
          .reverse()
          .map((d) => (
            <div key={d.date} className="rounded-xl border border-neutral-100 bg-white px-4 py-3 text-sm shadow-xs">
              <div className="flex items-center justify-between">
                <span className="text-neutral-500">{d.date}</span>
                <b>{d.hasData ? `${d.caloriesIn} kcal` : "Belum dicatat"}</b>
              </div>
              <p className="mt-1 text-xs text-neutral-500">{d.foodLogStatus === "complete" ? "Lengkap" : d.foodLogStatus === "partial" ? "Parsial" : "Belum ada catatan makan"}</p>
              <button type="button" disabled={savingDate !== null} onClick={() => setFoodLogComplete(d.date, d.foodLogStatus !== "complete")} className="mt-2 rounded-lg border border-neutral-300 px-3 py-1.5 text-xs disabled:opacity-50">
                {savingDate === d.date ? "Menyimpan..." : d.foodLogStatus === "complete" ? "Buka kembali catatan" : "Semua asupan tanggal ini sudah dicatat"}
              </button>
            </div>
          ))}
      </section>
      </div>
      </details>
    </div>
  );
}
