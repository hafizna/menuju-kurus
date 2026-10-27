"use client";

import { useEffect, useState } from "react";
import type { FitnessIntelligence } from "@/lib/fitnessIntelligence";
import type { CompositionTrend } from "@/lib/fitnessTrends";

const signed = (value: number) => `${value > 0 ? "+" : ""}${value}`;

function readingDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("id-ID", { dateStyle: "medium" });
}

// Body fat and what it implies for fat mass belong with the other body
// measurements, so they live in Tubuh and not in Kebugaran. It reads the same
// derived data as the fitness summary, and stays out of the way if that fails.
export default function BodyCompositionSection() {
  const [data, setData] = useState<FitnessIntelligence | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/fitness-intelligence", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((result) => { if (!controller.signal.aborted && result?.intelligence) setData(result.intelligence); })
      .catch(() => { /* The rest of the tab does not depend on this. */ });
    return () => controller.abort();
  }, []);
  if (!data) return null;

  const hasPairs = data.composition && data.composition.recent.pairs + data.composition.baseline.pairs > 0;
  return (
    <section className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900" aria-labelledby="body-fat-title">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="body-fat-title" className="font-semibold">Body fat &amp; komposisi</h2>
          <p className="mt-0.5 text-xs text-neutral-500">Estimasi, paling berguna dilihat sebagai tren.</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-lg font-bold tabular-nums">{data.bodyFatLatest === null ? "Belum ada" : `${data.bodyFatLatest}%`}</p>
          {data.bodyFatDate && (
            <p className="text-xs text-neutral-500">
              {readingDate(data.bodyFatDate)} · {data.bodyFatSource === "shortcuts" ? "Apple Health" : "manual"}
            </p>
          )}
        </div>
      </div>
      {data.bodyFatLatest === null && (
        <p className="text-sm leading-relaxed text-neutral-500">
          Body fat bisa diisi lewat Check-in tubuh di atas, atau masuk otomatis dari timbangan pintar yang menulis ke Apple Health.
        </p>
      )}
      {hasPairs && data.composition && <CompositionTable composition={data.composition} />}
    </section>
  );
}

function CompositionTable({ composition }: { composition: CompositionTrend }) {
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
    <div className="space-y-3 border-t border-neutral-100 pt-3 dark:border-neutral-800">
      <p className="text-xs text-neutral-500">
        Rata-rata 14 hari terakhir dibanding 14 hari sebelumnya, hanya dari hari yang punya berat dan body fat.
      </p>
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
    </div>
  );
}
