"use client";

import { useCallback, useEffect, useState } from "react";
import { checkInDue } from "@/lib/body";
import { RESPONSE_PERIODS, type ResponsePeriod } from "@/lib/bodyResponse";
import type { BodyResponse } from "./BodyTab";
import CalibrationPanel from "./CalibrationPanel";
import BodyResponsePanel from "./BodyResponsePanel";

export default function OverviewTab({ onCheckIn }: { onCheckIn: () => void }) {
  const [data, setData] = useState<BodyResponse | null>(null);
  const [error, setError] = useState("");
  const [days, setDays] = useState<ResponsePeriod>(28);
  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/body");
      if (!response.ok)
        throw new Error(
          "Progress belum dapat dimuat. Periksa koneksi dan konfigurasi database.",
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
      <p className="py-6 text-center text-neutral-500">Memuat progress...</p>
    );
  const waistDue = checkInDue(data.snapshots, "waistCm", data.today);
  return (
    <div className="space-y-4">
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
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Periode pengukuran</h2>
        <div
          className="flex rounded-xl bg-neutral-100 p-1 dark:bg-neutral-900"
          role="group"
          aria-label="Periode pengukuran"
        >
          {RESPONSE_PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={days === value}
              onClick={() => setDays(value)}
              className={`rounded-lg px-3 py-2 text-xs ${days === value ? "bg-white shadow-xs dark:bg-neutral-800" : "text-neutral-500"}`}
            >
              {value} hari
            </button>
          ))}
        </div>
      </div>
      <BodyResponsePanel period={days} />
      <CalibrationPanel />
    </div>
  );
}
