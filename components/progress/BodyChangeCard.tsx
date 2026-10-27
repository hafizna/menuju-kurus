"use client";

import { useState } from "react";
import { BODY_LABELS, bodyChanges, type BodySnapshot } from "@/lib/body";

const chip = "flex min-h-10 cursor-pointer items-center rounded-full border border-neutral-300 px-3.5 text-sm transition-colors peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2 dark:border-neutral-700";
const PERIODS = [
  { id: "all", label: "Sejak mulai", days: null },
  { id: "30", label: "30 hari", days: 30 },
] as const;

const shown = (value: number) => String(Math.round(value * 10) / 10);

// Leads the Tubuh tab with what people actually ask: what changed? Direction is
// shown without judging it, because up or down is good or bad depending on the goal.
export default function BodyChangeCard({ snapshots, today }: { snapshots: BodySnapshot[]; today: string }) {
  const [period, setPeriod] = useState<(typeof PERIODS)[number]["id"]>("all");
  const days = PERIODS.find((entry) => entry.id === period)!.days;
  const { changes, missing } = bodyChanges(snapshots, days, today);

  return (
    <section className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900" aria-labelledby="body-change-title">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="body-change-title" className="font-semibold">Perubahanmu</h2>
        <fieldset>
          <legend className="sr-only">Periode perubahan</legend>
          <div className="flex gap-2">
            {PERIODS.map((entry) => (
              <label key={entry.id} className="relative">
                <input type="radio" name="body-change-period" value={entry.id} checked={period === entry.id} onChange={() => setPeriod(entry.id)} className="peer sr-only" />
                <span className={chip}>{entry.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </div>

      {changes.length > 0 ? (
        <ul className="divide-y divide-neutral-100 dark:divide-neutral-800" aria-label="Perubahan ukuran">
          {changes.map((change) => {
            const meta = BODY_LABELS[change.field];
            const size = Math.round(Math.abs(change.delta) * 10) / 10;
            const direction = size === 0 ? "same" : change.delta < 0 ? "down" : "up";
            const words = direction === "same" ? "tidak berubah" : `${direction === "down" ? "turun" : "naik"} ${shown(size)} ${meta.unit}`;
            return (
              <li key={change.field} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{meta.label}<span className="sr-only"> {words} dalam {change.days} hari</span></p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    {shown(change.from.value)} → {shown(change.to.value)} {meta.unit} · {change.days} hari
                  </p>
                </div>
                <p className="shrink-0 text-right text-lg font-semibold tabular-nums" aria-hidden="true">
                  {direction === "same" ? "→ 0" : `${direction === "down" ? "↓" : "↑"} ${shown(size)}`}
                  <span className="ml-1 text-xs font-normal text-neutral-500">{meta.unit}</span>
                </p>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-sm leading-relaxed text-neutral-500">
          {snapshots.length > 1 && days !== null
            ? "Belum ada dua catatan dalam 30 hari terakhir. Coba lihat Sejak mulai."
            : "Perubahan muncul setelah ada dua catatan untuk ukuran yang sama, di tanggal berbeda."}
        </p>
      )}

      {changes.length > 0 && missing.length > 0 && (
        <p className="text-xs leading-relaxed text-neutral-500">
          Belum cukup catatan untuk {missing.map((field) => BODY_LABELS[field].label.toLowerCase()).join(", ")}. Catat lagi di tanggal lain agar perubahannya terlihat.
        </p>
      )}
      <p className="text-xs leading-relaxed text-neutral-500">
        Naik atau turun bukan otomatis baik atau buruk; itu tergantung tujuanmu. Satu angka bisa bergeser karena waktu ukur dan cairan, jadi lihat tren beberapa minggu.
      </p>
    </section>
  );
}
