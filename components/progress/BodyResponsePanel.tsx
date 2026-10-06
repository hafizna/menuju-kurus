"use client";

import { useEffect, useState } from "react";
import type {
  BodyResponseReport,
  Coverage,
  ResponsePeriod,
} from "@/lib/bodyResponse";
import ResponseChart, { type ResponseField } from "./ResponseChart";

const panels: { field: ResponseField; label: string; unit: string }[] = [
  { field: "calories", label: "Asupan lengkap", unit: "kcal" },
  { field: "protein", label: "Protein dari catatan lengkap", unit: "g" },
  { field: "activity", label: "Aktivitas tercatat", unit: "kcal" },
  { field: "weight", label: "Berat", unit: "kg" },
  { field: "waist", label: "Pinggang", unit: "cm" },
];
function Readiness({ metric }: { metric: Coverage }) {
  return (
    <details className="mt-2 text-xs text-neutral-500">
      <summary className="cursor-pointer">
        {metric.ready
          ? "Data cukup untuk deskripsi terbatas"
          : "Data belum siap untuk insight"}{" "}
        · {metric.observedDays}/{metric.totalDays} hari
      </summary>
      {metric.reasons.length ? (
        <ul className="mt-2 list-disc space-y-1 pl-4">
          {metric.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2">
          Cakupan dan sebaran memenuhi aturan aplikasi; ini tidak membuktikan
          akurasi catatan atau hubungan sebab-akibat.
        </p>
      )}
    </details>
  );
}
export default function BodyResponsePanel({
  period,
}: {
  period: ResponsePeriod;
}) {
  const [report, setReport] = useState<BodyResponseReport | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setReport(null);
    setError("");
    fetch(`/api/body-response?days=${period}`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Body Response belum dapat dimuat. Periksa koneksi dan konfigurasi database.",
          );
        const result: BodyResponseReport = await response.json();
        if (!controller.signal.aborted) setReport(result);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error
              ? error.message
              : "Gagal memuat Body Response.",
          );
      });
    return () => controller.abort();
  }, [period, retry]);
  if (error)
    return (
      <section className="space-y-3 rounded-2xl border border-neutral-100 p-4 dark:border-neutral-800">
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
        <button
          type="button"
          onClick={() => setRetry((value) => value + 1)}
          className="rounded-lg border px-3 py-2 text-sm"
        >
          Coba muat Body Response lagi
        </button>
      </section>
    );
  if (!report || report.periodDays !== period)
    return (
      <p role="status" className="py-4 text-sm text-neutral-500">
        Memuat Body Response {period} hari...
      </p>
    );
  const { current, previous, comparison } = report;
  const metrics: {
    label: string;
    metric: Coverage;
    unit: string;
    delta: number | null;
  }[] = [
    {
      label: "Rata-rata asupan",
      metric: current.food,
      unit: "kcal",
      delta: comparison.calories,
    },
    {
      label: "Rata-rata protein",
      metric: current.protein,
      unit: "g",
      delta: comparison.protein,
    },
    {
      label: "Rata-rata aktivitas tercatat",
      metric: current.activity,
      unit: "kcal",
      delta: comparison.activity,
    },
  ];
  const reviewDays = current.days.filter((day) => day.review.length);
  return (
    <div className="space-y-4" data-testid="body-response">
      <section className="rounded-2xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold">Body Response · {period} hari</h2>
        <p className="mt-1 text-xs text-neutral-500">
          {current.start} — {current.end}
        </p>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">
          {current.completeFoodDays}/{period} hari catatan makan dikonfirmasi
          lengkap. Rata-rata memakai nilai yang tersedia; hari kosong dan
          parsial tidak dimasukkan sebagai nol.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {metrics.map(({ label, metric, unit, delta }) => (
            <div
              key={label}
              className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-950"
            >
              <h3 className="text-xs text-neutral-500">{label}</h3>
              <p className="mt-1 text-lg font-semibold tabular-nums">
                {metric.average === null
                  ? "Belum ada data"
                  : `${metric.average} ${unit}/hari tercatat`}
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                {delta === null
                  ? "Belum dapat dibandingkan dengan periode sebelumnya"
                  : `${delta > 0 ? "+" : ""}${delta} ${unit}/hari vs ${period} hari sebelumnya`}
              </p>
              <Readiness metric={metric} />
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-neutral-500">
          Aktivitas merupakan angka yang dilaporkan, bukan TDEE. Jika Apple
          Health tersedia pada suatu hari, entri manual tidak ditambahkan ke
          snapshot itu. Snapshot hari ini masih bisa bertambah. Sumber periode:{" "}
          {current.activity.sources
            .map((source) =>
              source === "apple_health" ? "Apple Health" : "manual",
            )
            .join(", ") || "belum ada"}
          .
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          Periode sebelumnya: {previous.start} — {previous.end}; asupan{" "}
          {previous.food.observedDays}/{period}, protein{" "}
          {previous.protein.observedDays}/{period}, aktivitas{" "}
          {previous.activity.observedDays}/{period} hari tersedia. Selisih hanya
          muncul bila kedua periode memenuhi aturan dan sumber aktivitas
          sebanding.
        </p>
      </section>
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {(
          [
            ["Berat", current.weight, "kg"],
            ["Pinggang", current.waist, "cm"],
          ] as const
        ).map(([label, metric, unit]) => (
          <div
            key={label}
            className="rounded-2xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900"
          >
            <h3 className="text-sm font-semibold">
              Perubahan {label.toLowerCase()}
            </h3>
            <p className="mt-1 text-xl font-semibold">
              {metric.change === null
                ? "Belum cukup untuk membandingkan"
                : `${metric.change > 0 ? "+" : ""}${metric.change} ${unit}`}
            </p>
            <p className="mt-2 text-xs text-neutral-500">
              {metric.basis}.{" "}
              {metric.baseline !== null && metric.recent !== null
                ? `${metric.baseline} → ${metric.recent} ${unit}`
                : "Belum ada pasangan angka yang cukup."}
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              {metric.first && metric.last
                ? `Tanggal ukuran tersedia: ${metric.first.date} — ${metric.last.date}.`
                : "Belum ada ukuran pada periode ini."}
              {label === "Berat"
                ? ` Sampel jendela awal/akhir: ${metric.baselineSamples}/${metric.recentSamples}.`
                : ""}
            </p>
            <Readiness metric={metric} />
          </div>
        ))}
      </section>
      <section className="rounded-2xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold">Yang bisa dideskripsikan dari catatan</h2>
        {report.insights.length ? (
          <ul className="mt-3 space-y-4">
            {report.insights.map((insight) => (
              <li key={insight.id}>
                <p className="text-sm">{insight.text}</p>
                <p className="mt-1 text-xs text-neutral-500">
                  {insight.evidence}
                </p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-neutral-500">
            Belum cukup data yang tersebar dan lolos pemeriksaan untuk
            menyandingkan perubahan tubuh dengan asupan atau aktivitas. Ukuran
            dan catatan yang ada tetap ditampilkan.
          </p>
        )}
        {!!reviewDays.length && (
          <p className="mt-3 text-xs text-amber-700 dark:text-amber-400">
            {reviewDays.length} tanggal memiliki nilai yang perlu ditinjau.
            Nilai ekstrem yang valid tetap ditampilkan; nilai tidak valid tidak
            dipakai dalam rata-rata. Ini pemeriksaan kualitas data, bukan
            diagnosis.
          </p>
        )}
      </section>
      <section className="space-y-4 rounded-2xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <h2 className="font-semibold">Grafik pada sumbu tanggal yang sama</h2>
        <p className="text-xs text-neutral-500">
          Setiap panel memiliki skala vertikal dan satuan sendiri. Titik
          menunjukkan catatan asli; tanggal kosong tidak dihubungkan atau diisi
          nol. Titik amber memiliki catatan pemeriksaan di tabel.
        </p>
        {panels.map((panel) => (
          <div key={panel.field}>
            <h3 className="text-sm font-medium">
              {panel.label} ({panel.unit})
            </h3>
            <ResponseChart days={current.days} {...panel} />
          </div>
        ))}
      </section>
      <details className="rounded-2xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
        <summary className="cursor-pointer text-sm font-medium">
          Catatan harian dan kualitas data
        </summary>
        <p className="mt-2 text-xs text-neutral-500">
          Tabel menunjukkan angka tercatat, termasuk hari parsial. Grafik dan
          rata-rata asupan/protein hanya memakai hari lengkap.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">
              Catatan harian Body Response periode {current.start} sampai{" "}
              {current.end}
            </caption>
            <thead>
              <tr>
                <th className="p-2">Tanggal</th>
                <th className="p-2">Makan</th>
                <th className="p-2">Asupan kcal</th>
                <th className="p-2">Protein g</th>
                <th className="p-2">Aktivitas kcal</th>
                <th className="p-2">Berat kg</th>
                <th className="p-2">Pinggang cm</th>
                <th className="p-2">Periksa</th>
              </tr>
            </thead>
            <tbody>
              {current.days.map((day) => (
                <tr
                  key={day.date}
                  className="border-t border-neutral-100 dark:border-neutral-800"
                >
                  <td className="whitespace-nowrap p-2">{day.date}</td>
                  <td className="p-2">
                    {day.foodStatus === "complete"
                      ? "Lengkap"
                      : day.foodStatus === "partial"
                        ? "Parsial"
                        : "Belum dicatat"}
                  </td>
                  {(
                    [
                      "calories",
                      "protein",
                      "activity",
                      "weight",
                      "waist",
                    ] as const
                  ).map((field) => (
                    <td key={field} className="p-2">
                      {(field === "calories"
                        ? day.recordedCalories
                        : field === "protein"
                          ? day.recordedProtein
                          : day[field]) ?? "—"}
                      {field === "activity" && day.activitySource && (
                        <span className="block text-neutral-500">
                          {day.activitySource === "apple_health"
                            ? "Apple Health"
                            : "Manual"}
                        </span>
                      )}
                    </td>
                  ))}
                  <td className="p-2">
                    {day.review.length
                      ? [
                          ...new Set(
                            day.review.map((code) =>
                              code.startsWith("food")
                                ? "Asupan"
                                : code.startsWith("protein")
                                  ? "Protein"
                                  : code.startsWith("activity")
                                    ? "Aktivitas"
                                    : code.startsWith("weight")
                                      ? "Berat"
                                      : "Pinggang",
                            ),
                          ),
                        ].join(", ")
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details className="rounded-2xl border border-neutral-100 p-4 dark:border-neutral-800">
        <summary className="cursor-pointer text-sm font-medium">
          Aturan kesiapan data
        </summary>
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">
          Asupan/protein/aktivitas: minimal 75% hari tersedia, dan minimal 60%
          pada tiap paruh periode. Berat: minimal{" "}
          {report.policies.minimumWeightSamples} ukuran, 2 pada setiap jendela 7
          hari awal/akhir, serta jarak minimal setengah periode. Pinggang:
          minimal 2 ukuran, ada pada 7 hari awal/akhir, dan jarak minimal{" "}
          {report.policies.minimumWaistSpanDays} hari. Nilai yang ditandai untuk
          ditinjau menunda insight terkait. Aturan ini heuristik produk, bukan
          standar klinis.
        </p>
      </details>
      <p className="text-xs text-neutral-500">
        Tidak ada estimasi defisit, klaim lemak/otot, atau perubahan target
        otomatis dari panel ini.
      </p>
    </div>
  );
}
