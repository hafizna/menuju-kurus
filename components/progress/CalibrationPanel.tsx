"use client";

import { useEffect, useState } from "react";
import type { CalibrationResult, CalibrationReview } from "@/lib/calibration";

type CalibrationResponse = {
  calibration: CalibrationResult;
  fingerprint: string;
  review: CalibrationReview | null;
};
const LABELS: Record<CalibrationResult["status"], string> = {
  insufficient: "Data belum cukup",
  paused: "Kalibrasi ditunda",
  waiting: "Beri pola ini waktu",
  steady: "Pertahankan target dahulu",
  proposal: "Usulan penyesuaian bertahap",
};
export default function CalibrationPanel() {
  const [data, setData] = useState<CalibrationResponse | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    setError("");
    setData(null);
    setConfirmed(false);
    fetch("/api/calibration", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok)
          throw new Error(
            "Kalibrasi belum dapat dimuat. Coba lagi setelah koneksi tersedia.",
          );
        const result: CalibrationResponse = await response.json();
        if (!controller.signal.aborted) setData(result);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setError(
            error instanceof Error ? error.message : "Gagal memuat kalibrasi.",
          );
      });
    return () => controller.abort();
  }, [retry]);
  async function decide(action: "apply" | "keep") {
    if (!data || saving) return;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/calibration", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          fingerprint: data.fingerprint,
          contextConfirmed: confirmed,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Keputusan belum tersimpan.");
      setMessage(
        action === "apply"
          ? `Target ${result.settings.dailyTargetKcal} kcal/hari diterapkan. Target protein tetap ${result.settings.proteinTargetG} g.`
          : `Target ${result.settings.dailyTargetKcal} kcal/hari dipertahankan.`,
      );
      setRetry((value) => value + 1);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Keputusan belum tersimpan.",
      );
      setData(null);
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="font-semibold">Evaluasi target &amp; estimasi TDEE</h2>
      <p className="text-xs text-neutral-500">
        Evaluasi terpisah memakai 28 hari yang sudah selesai, sampai kemarin.
        Pilihan periode grafik di atas tidak mengubah periode kalibrasi ini.
      </p>
      {message && (
        <p role="status" className="text-sm text-brand-700 dark:text-brand-300">
          {message}
        </p>
      )}
      {error ? (
        <>
          <p role="alert" className="text-sm text-red-500">
            {error}
          </p>
          <button
            type="button"
            onClick={() => setRetry((value) => value + 1)}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            Muat ulang kalibrasi
          </button>
        </>
      ) : !data ? (
        <p role="status" className="text-sm text-neutral-500">
          Memuat evaluasi target...
        </p>
      ) : (
        <>
          <h3 className="text-sm font-medium">
            {LABELS[data.calibration.status]}
          </h3>
          <p className="text-xs text-neutral-500">
            {data.calibration.periodStart} — {data.calibration.periodEnd} ·{" "}
            {data.calibration.foodDays}/28 hari asupan lengkap ·{" "}
            {data.calibration.weightSamples} ukuran berat
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-950">
              <p className="text-xs text-neutral-500">Target aktif</p>
              <p className="font-semibold">
                {data.calibration.oldTarget} kcal/hari
              </p>
            </div>
            <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-950">
              <p className="text-xs text-neutral-500">
                Maintenance dari profil
              </p>
              <p className="font-semibold">
                {data.calibration.initialTdee === null
                  ? "Profil belum lengkap"
                  : `${data.calibration.initialTdee} kcal/hari`}
              </p>
            </div>
          </div>
          {data.calibration.estimatedTdee !== null && (
            <div className="rounded-xl border border-neutral-200 p-3 dark:border-neutral-700">
              <p className="text-sm font-medium">
                Estimasi dari asupan dan tren: sekitar{" "}
                {data.calibration.estimatedTdee} kcal/hari
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Rentang sensitivitas {data.calibration.tdeeRange![0]}–
                {data.calibration.tdeeRange![1]} kcal/hari. Ini perkiraan
                berdasarkan asumsi pencatatan dan perubahan berat, bukan
                interval kepercayaan atau pengukuran metabolisme. Laju berat
                tersmoothing {data.calibration.weeklyRate} kg/minggu.
              </p>
            </div>
          )}
          <ul className="list-disc space-y-1 pl-4 text-xs text-neutral-500">
            {data.calibration.reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
          {data.calibration.status === "proposal" && (
            <div className="space-y-3 rounded-xl border border-brand-200 bg-brand-50 p-3 dark:border-brand-900 dark:bg-brand-950/30">
              <p className="text-sm font-semibold">
                Usulan target: {data.calibration.oldTarget} →{" "}
                {data.calibration.proposedTarget} kcal/hari
              </p>
              <p className="text-xs text-neutral-500">
                Tinjau catatan terlebih dahulu. Perubahan cairan tubuh, kondisi
                kesehatan, metode ukur, dan perubahan besar aktivitas dapat
                membuat estimasi ini kurang sesuai. Jika konteksnya berubah,
                pertahankan target dan kumpulkan periode berikutnya.
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(event) => setConfirmed(event.target.checked)}
                  className="mt-1"
                />
                Saya sudah meninjau catatan dan kondisi serta aktivitas cukup
                serupa selama periode ini.
              </label>
              <button
                type="button"
                disabled={!confirmed || saving}
                onClick={() => void decide("apply")}
                className="w-full rounded-xl bg-brand-600 px-3 py-3 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving
                  ? "Menyimpan keputusan..."
                  : `Terapkan target ${data.calibration.proposedTarget} kcal`}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void decide("keep")}
                className="w-full rounded-xl border px-3 py-3 text-sm disabled:opacity-50"
              >
                Tetap pakai target sekarang
              </button>
              <p className="text-xs text-neutral-500">
                Kedua pilihan memberi jeda 28 hari sebelum evaluasi berikutnya.
                Target tidak berubah sebelum kamu memilih menerapkan.
              </p>
            </div>
          )}
          {data.review && (
            <p className="text-xs text-neutral-500">
              Keputusan terakhir:{" "}
              {data.review.decision === "applied"
                ? "target diterapkan"
                : "target dipertahankan"}{" "}
              · {data.review.previousTarget} → {data.review.selectedTarget}{" "}
              kcal/hari · evaluasi berikutnya mulai {data.review.reviewAfter}.
            </p>
          )}
          <details className="text-xs text-neutral-500">
            <summary className="cursor-pointer font-medium">
              Asumsi dan syarat kalibrasi
            </summary>
            <p className="mt-2 leading-relaxed">
              Minimal 26/28 hari asupan lengkap, 6 per pekan; 12 ukuran berat, 3
              per jendela 7 hari awal/akhir dan 3 di tengah; jarak ukur minimal
              21 hari, ukuran terakhir maksimal 3 hari dari akhir periode.
              Variasi atau perubahan berat yang besar, serta target/asupan di
              bawah batas awal program, menunda usulan. Pendekatan 7.700 kcal/kg
              dipakai sebagai sinyal estimasi, bukan konstanta fisiologis
              presisi. Aktivitas wearable tidak ditambahkan lagi. Usulan
              maksimal 100 kcal atau 5% target aktif, dibulatkan turun ke
              langkah 50 kcal; batas awal program 1.500/1.200 kcal menurut
              profil tetap berlaku sebagai batas engine, bukan jaminan kecukupan
              personal.
            </p>
          </details>
        </>
      )}
    </section>
  );
}
