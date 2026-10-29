"use client";

import { useCallback, useEffect, useState } from "react";
import { checkInDue } from "@/lib/body";
import { RESPONSE_PERIODS, type ResponsePeriod, type BodyResponseReport } from "@/lib/bodyResponse";
import type { BodyResponse } from "./BodyTab";
import CalibrationPanel from "./CalibrationPanel";
import BodyResponsePanel from "./BodyResponsePanel";
import WeeklyTab from "./WeeklyTab";
import KukangLoader from "@/components/KukangLoader";

export default function OverviewTab({ onCheckIn }: { onCheckIn: () => void }) {
  const [data, setData] = useState<BodyResponse | null>(null);
  const [error, setError] = useState("");
  const [days, setDays] = useState<ResponsePeriod>(28);
  const [report, setReport] = useState<BodyResponseReport | null>(null);
  const [reportError, setReportError] = useState("");
  const onReport = useCallback((next: BodyResponseReport) => { setReport(next); setReportError(""); }, []);
  useEffect(() => {
    const controller = new AbortController();
    setReport(null); setReportError("");
    fetch(`/api/body-response?days=${days}`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error("Kesiapan analisis belum dapat dimuat. Buka detail untuk mencoba lagi.");
        const next = await res.json();
        if (!controller.signal.aborted) setReport(next);
      })
      .catch((e) => { if (!controller.signal.aborted) setReportError(e instanceof Error ? e.message : "Kesiapan analisis belum dapat dimuat."); });
    return () => controller.abort();
  }, [days]);
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/body");
      if (!response.ok)
        throw new Error(
          "Progress belum dapat dimuat. Periksa koneksi lalu coba lagi.",
        );
      setData(await response.json());
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Gagal memuat progress.",
      );
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  if (!data)
    return error ? (
      <div className="space-y-3">
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-xl border px-4 py-2"
        >
          Coba lagi
        </button>
      </div>
    ) : (
      <KukangLoader size="section" label="Memuat progress..." />
    );
  const waistDue = checkInDue(data.snapshots, "waistCm", data.today);
  const analysisReady = !!report && report.current.food.ready && report.current.weight.ready;
  return (
    <div className="space-y-6">
      {error && (
        <p role="alert" className="text-sm text-red-500">
          {error}
        </p>
      )}
      <section className="rounded-2xl bg-brand-700 p-5 text-white">
        <p className="text-xs text-brand-100">Perubahan dari catatanmu</p>
        <h2 className="mt-1 text-xl font-semibold">
          Lihat pola, beri tubuh waktu
        </h2>
        <p className="mt-2 text-sm text-brand-100">
          Berat dan ukuran tubuh membantu mengevaluasi progres. Perubahan naik
          atau turun tidak otomatis berarti berhasil atau gagal.
        </p>
        <button
          type="button"
          onClick={onCheckIn}
          className="mt-4 rounded-xl bg-white px-4 py-2 text-sm font-medium text-brand-800"
        >
          {waistDue.due ? "Check-in tubuh jika berkenan" : "Lihat ukuran tubuh"}
        </button>
      </section>
      <section id="minggu-ini" aria-labelledby="week-title" className="scroll-mt-4 space-y-3">
        <h2 id="week-title" className="px-1 text-sm font-semibold text-neutral-500">Minggu ini</h2>
        <WeeklyTab />
      </section>
      <section aria-labelledby="pattern-title" className="space-y-4">
      <h2 id="pattern-title" className="px-1 text-sm font-semibold text-neutral-500">Pola jangka panjang</h2>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Periode pengukuran</h3>
        <div
          className="flex rounded-xl bg-neutral-100 p-1"
          role="group"
          aria-label="Periode pengukuran"
        >
          {RESPONSE_PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={days === value}
              onClick={() => setDays(value)}
              className={`rounded-lg px-3 py-2 text-xs ${days === value ? "bg-white shadow-xs" : "text-neutral-500"}`}
            >
              {value} hari
            </button>
          ))}
        </div>
      </div>
      <section className="rounded-2xl border border-neutral-100 bg-white p-4 text-sm text-neutral-600 shadow-xs">
        <h3 className="font-semibold text-neutral-900">{analysisReady ? "Pola mulai bisa dibaca" : "Bangun catatan sedikit demi sedikit"}</h3>
        {report ? <>
          <p className="mt-1">{report.current.start} — {report.current.end} · {report.current.food.observedDays}/{days} hari asupan lengkap · {report.current.weight.observedDays} ukuran berat.</p>
          {analysisReady ? <p className="mt-2">Data cukup untuk deskripsi terbatas. Lihat detail bila ingin meninjau grafik dan sumber angkanya.</p> : <>
            <p className="mt-2">Catat makan dan konfirmasikan hanya hari yang benar-benar lengkap. Jika berkenan, timbang dengan kondisi yang mirip. Kesiapan bergantung pada jumlah dan sebaran data.</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-xs">{[...report.current.food.reasons, ...report.current.weight.reasons].map((reason) => <li key={reason}>{reason}</li>)}</ul>
          </>}
        </> : <p role="status" className="mt-1">{reportError || "Memeriksa catatan yang tersedia..."}</p>}
      </section>
      <details key={days} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs">
        <summary className="cursor-pointer text-sm font-medium">Lihat analisis dan grafik {days} hari{analysisReady ? "" : " · data masih dikumpulkan"}</summary>
        <div className="mt-4 space-y-4">{report || reportError ? <BodyResponsePanel period={days} initialReport={report ?? undefined} onReport={onReport} /> : <p role="status" className="text-sm text-neutral-500">Memuat analisis...</p>}</div>
      </details>
      <details className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs">
        <summary className="cursor-pointer text-sm font-medium">Evaluasi target · periode terpisah 28 hari</summary>
        <div className="mt-4"><CalibrationPanel /></div>
      </details>
      </section>
    </div>
  );
}
