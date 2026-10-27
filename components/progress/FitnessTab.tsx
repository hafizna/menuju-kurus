"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { FitnessIntelligence } from "@/lib/fitnessIntelligence";
import type { SeriesTrend } from "@/lib/fitnessTrends";
import type { LoggedActivity } from "@/lib/activity";
import { IconSparkle } from "@/components/icons";

interface AiSummary {
  summary: string;
  recommendations: string[];
  source: "ai" | "template";
}

export default function FitnessTab() {
  const [data, setData] = useState<FitnessIntelligence | null>(null);
  const [logged, setLogged] = useState<LoggedActivity | null>(null);
  const [ai, setAi] = useState<AiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/fitness-intelligence");
      if (!res.ok) throw new Error("Data kebugaran belum dapat dimuat.");
      const result = await res.json(); setData(result.intelligence); setLogged(result.loggedActivity ?? null);
    } catch (e) { setError(e instanceof Error ? e.message : "Data kebugaran belum dapat dimuat."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function generateAi() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/fitness-intelligence", { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Gagal membuat recap");
      setAi(result.ai);
      setData(result.intelligence);
      setLogged(result.loggedActivity ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat recap");
    } finally {
      setGenerating(false);
    }
  }

  if (!data && error) return <div className="space-y-3"><p role="alert" className="text-sm text-red-500">{error}</p><button type="button" onClick={() => void load()} className="rounded-lg border px-3 py-2 text-sm">Coba lagi</button></div>;
  if (loading || !data)
    return <div className="p-6 text-center text-neutral-400">Memuat...</div>;

  // The composition sentence is shown with the body measurements in Tubuh.
  const otherSignals = data.signals.filter((item) => item !== data.composition?.statement);
  const statusText =
    data.scoreLabel === "baseline"
      ? "Membangun baseline"
      : data.scoreLabel === "on-track"
      ? "On track"
      : data.scoreLabel === "building"
        ? "Sedang dibangun"
        : "Perlu perhatian";

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <p className="text-sm text-neutral-500">Fokus: {data.label}</p>
        <Link href="/settings" className="text-sm text-brand-600">
          Ubah goal
        </Link>
      </div>

      <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-sm text-neutral-500">{data.score === null ? "Kenali titik awalmu" : `${data.label} Score`}</div>
            <div className={data.score === null ? "mt-1 text-xl font-bold" : "text-4xl font-bold"}>
              {data.score === null ? "Belum cukup data" : <>{data.score}<span className="text-base text-neutral-400">/100</span></>}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-brand-600">
              {statusText}
            </div>
            <div className="text-xs text-neutral-400">
              Cakupan data: {data.dataConfidence === "high" ? "lebih lengkap" : data.dataConfidence === "medium" ? "sebagian tersedia" : "terbatas"}
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
          {data.recap}
        </p>
        {!data.baselineReady && <div className="mt-3 space-y-2">
          <ul className="space-y-1 text-sm text-neutral-500">{data.baselineReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
          <Link href={data.goal === "athletic" ? "/settings" : "/progress?tab=body"} className="inline-block rounded-lg bg-brand-600 px-3 py-2 text-sm text-white">{data.goal === "athletic" ? "Lengkapi profil fitness" : "Catat ukuran tubuh"}</Link>
        </div>}
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Metric
          label="VO₂ max"
          value={data.vo2Max === null ? "Belum ada" : `${data.vo2Max} mL/kg/min`}
          note={data.vo2MaxReading
            ? `Apple Health · ${measurementDate(data.vo2MaxReading.recordedAt)} · estimasi`
            : data.vo2Max === null ? "estimasi kebugaran kardio" : "Isian Profil · estimasi"}
          extra={trendLine(data.vo2MaxTrend, "mL/kg/min")}
        />
        <Metric
          label="Resting HR"
          value={
            data.restingHeartRate === null
              ? "Belum ada"
              : `${data.restingHeartRate} bpm`
          }
          note={data.restingHeartRateReading
            ? `Apple Health · ${measurementDate(data.restingHeartRateReading.recordedAt)}`
            : data.restingHeartRate === null ? undefined : "Isian Profil"}
          extra={trendLine(data.restingHeartRateTrend, "bpm")}
        />
        <Metric
          label="Kardio"
          value={logged && logged.cardioMinutes > 0 ? `${logged.cardioMinutes} menit` : "Belum ada catatan"}
          note={`${logged?.windowDays ?? 7} hari terakhir, dari Gerak hari ini`}
          extra={data.cardioMinutes > 0 ? `Rutinitas di Profil: ${data.cardioMinutes} menit/minggu` : undefined}
        />
        <Metric
          label="Latihan beban"
          value={logged && logged.strengthDays > 0 ? `${logged.strengthDays} hari` : "Belum ada catatan"}
          note={`${logged?.windowDays ?? 7} hari terakhir, dari Gerak hari ini`}
          extra={data.strengthDays > 0 ? `Rutinitas di Profil: ${data.strengthDays} hari/minggu` : undefined}
        />
      </section>

      {otherSignals.length > 0 && (
        <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="mb-2 text-sm font-medium">Dari datamu</div>
          <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
            {otherSignals.map((item, index) => (
              <li key={index} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(data.vo2Max === null || data.restingHeartRate === null) && (
        <p className="px-1 text-xs leading-relaxed text-neutral-500">
          Tidak punya jam tangan? Isi sendiri saja: VO₂ max, detak istirahat, dan rutinitas latihan ada di{" "}
          <Link href="/settings" className="font-semibold text-brand-700 dark:text-brand-300">Profil → Aktivitas &amp; fitness</Link>.
          Sesi yang kamu catat di Home lewat Gerak hari ini muncul di Kardio dan Latihan beban.
        </p>
      )}

      <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-2 text-sm font-medium">Prioritas berikutnya</div>
        {data.priorities.length ? (
          <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
            {data.priorities.map((item, index) => (
              <li key={index} className="flex gap-2">
                <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                {item}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">
            Pertahankan pola saat ini dan terus kumpulkan data.
          </p>
        )}
      </section>

      <section className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold">
              <IconSparkle className="h-4 w-4 text-brand-600 dark:text-brand-400" />{" "}
              {ai?.source === "template" ? "Recap Otomatis" : "Recap AI"}
            </div>
            <div className="text-xs text-neutral-400">Rangkuman dari catatan yang tersedia</div>
          </div>
          <button
            onClick={generateAi}
            disabled={generating}
            className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50"
          >
            {generating ? "Membuat..." : ai ? "Buat ulang" : "Buat recap"}
          </button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {ai?.source === "template" && (
          <p className="text-xs text-neutral-400">
            Rangkuman otomatis berdasarkan catatanmu.
          </p>
        )}
        {ai && (
          <>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">
              {ai.summary}
            </p>
            <ul className="space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
              {ai.recommendations.map((item, index) => (
                <li key={index}>• {item}</li>
              ))}
            </ul>
          </>
        )}
      </section>

      <p className="px-1 text-xs text-neutral-400">
        Bukan diagnosis medis. VO₂ max dan body fat dari wearable atau smart
        scale adalah estimasi; keputusan memakai tren, bukan satu angka.
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
  extra,
}: {
  label: string;
  value: string;
  note?: string;
  extra?: string;
}) {
  return (
    <div className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
      {note && <div className="text-xs text-neutral-400">{note}</div>}
      {extra && <div className="mt-1 text-xs text-neutral-400">{extra}</div>}
    </div>
  );
}

function trendLine(trend: SeriesTrend | null, unit: string) {
  if (!trend?.latest) return undefined;
  if (trend.stale && trend.ageDays !== null) return `Data lama: ${trend.ageDays} hari lalu`;
  if (trend.ready && trend.recent.average !== null && trend.baseline.average !== null) {
    return `Rata-rata terbaru ${trend.recent.average} ${unit}, sebelumnya ${trend.baseline.average}`;
  }
  return undefined;
}

function measurementDate(value: string) {
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}
