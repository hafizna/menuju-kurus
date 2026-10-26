"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { FitnessIntelligence } from "@/lib/fitnessIntelligence";
import type { CompositionTrend, SeriesTrend } from "@/lib/fitnessTrends";
import { IconSparkle } from "@/components/icons";

interface AiSummary {
  summary: string;
  recommendations: string[];
  source: "ai" | "template";
}

export default function FitnessTab() {
  const [data, setData] = useState<FitnessIntelligence | null>(null);
  const [ai, setAi] = useState<AiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const res = await fetch("/api/fitness-intelligence");
      if (!res.ok) throw new Error("Data fitness belum dapat dimuat.");
      const result = await res.json(); setData(result.intelligence);
    } catch (e) { setError(e instanceof Error ? e.message : "Data fitness belum dapat dimuat."); }
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
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat recap");
    } finally {
      setGenerating(false);
    }
  }

  if (!data && error) return <div className="space-y-3"><p role="alert" className="text-sm text-red-500">{error}</p><button type="button" onClick={() => void load()} className="rounded-lg border px-3 py-2 text-sm">Coba lagi</button></div>;
  if (loading || !data)
    return <div className="p-6 text-center text-neutral-400">Memuat...</div>;

  // The composition card already shows its own sentence, so list the others.
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
          label="Tren berat"
          value={
            data.weightTrendKgWeek === null
              ? "Belum ada"
              : `${data.weightTrendKgWeek > 0 ? "+" : ""}${data.weightTrendKgWeek} kg/mgg`
          }
        />
        <Metric
          label="Body fat"
          value={
            data.bodyFatLatest === null ? "Belum ada" : `${data.bodyFatLatest}%`
          }
          note={
            data.bodyFatDate
              ? `${data.bodyFatDate} · ${data.bodyFatSource === "shortcuts" ? "Apple Health" : "manual"}; estimasi`
              : "estimasi"
          }
        />
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
          value={`${data.cardioMinutes} menit`}
          note="minggu ini"
        />
        <Metric
          label="Strength"
          value={`${data.strengthDays} hari`}
          note="minggu ini"
        />
      </section>

      {data.composition && data.composition.recent.pairs + data.composition.baseline.pairs > 0 && (
        <CompositionCard composition={data.composition} />
      )}

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

const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;

function CompositionCard({ composition }: { composition: CompositionTrend }) {
  const { recent, baseline, change } = composition;
  const rows = change
    ? [
        { label: "Berat", unit: "kg", before: baseline.weightKg, after: recent.weightKg, delta: change.weightKg },
        { label: "Body fat", unit: "%", before: baseline.bodyFatPercent, after: recent.bodyFatPercent, delta: change.bodyFatPoints },
        { label: "Massa lemak", unit: "kg", before: baseline.fatMassKg, after: recent.fatMassKg, delta: change.fatMassKg },
        { label: "Massa bebas lemak", unit: "kg", before: baseline.fatFreeMassKg, after: recent.fatFreeMassKg, delta: change.fatFreeMassKg },
      ]
    : [];
  return (
    <section className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      <div>
        <div className="text-sm font-semibold">Komposisi tubuh (estimasi)</div>
        <div className="text-xs text-neutral-400">
          Rata-rata 14 hari terakhir dibanding 14 hari sebelumnya, hanya dari hari yang punya berat dan body fat.
        </div>
      </div>
      {change ? (
        <>
          <table className="w-full text-sm">
            <caption className="sr-only">Perubahan komposisi tubuh antara dua periode 14 hari</caption>
            <thead className="text-xs text-neutral-400">
              <tr>
                <th scope="col" className="py-1 text-left font-normal">Ukuran</th>
                <th scope="col" className="py-1 text-right font-normal">Sebelumnya</th>
                <th scope="col" className="py-1 text-right font-normal">Terbaru</th>
                <th scope="col" className="py-1 text-right font-normal">Selisih</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label} className="border-t border-neutral-100 dark:border-neutral-800">
                  <th scope="row" className="py-1.5 text-left font-normal">{row.label}</th>
                  <td className="py-1.5 text-right">{row.before} {row.unit}</td>
                  <td className="py-1.5 text-right">{row.after} {row.unit}</td>
                  <td className="py-1.5 text-right font-medium">{signed(row.delta)} {row.unit === "%" ? "poin" : row.unit}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {composition.statement && <p className="text-sm text-neutral-600 dark:text-neutral-300">{composition.statement}</p>}
          <p className="text-xs text-neutral-400">
            Sampel {recent.pairs} dan {baseline.pairs} hari{composition.confidence === "low" ? "; masih sedikit, anggap sebagai gambaran awal" : ""}.
          </p>
        </>
      ) : (
        <p className="text-sm text-neutral-500">{composition.needs}</p>
      )}
      <p className="text-xs text-neutral-400">
        Massa bebas lemak mencakup air, glikogen, organ, dan tulang, bukan otot saja. Body fat dari timbangan impedansi
        bergeser karena cairan dan waktu timbang; pakai tren, bukan satu angka.
      </p>
    </section>
  );
}

function measurementDate(value: string) {
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}
