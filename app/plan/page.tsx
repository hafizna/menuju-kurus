"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DayLog, PlanType } from "@/lib/types";

interface PlanResponse {
  suggestion: { recommended: PlanType; reason: string };
  currentHour: number;
  log: DayLog;
}

export default function PlanPage() {
  const router = useRouter();
  const [data, setData] = useState<PlanResponse | null>(null);
  const [saving, setSaving] = useState<PlanType | null>(null);

  useEffect(() => {
    fetch("/api/plan")
      .then((r) => r.json())
      .then(setData);
  }, []);

  async function choose(plan: PlanType) {
    setSaving(plan);
    try {
      await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      router.push("/");
    } finally {
      setSaving(null);
    }
  }

  if (!data) return <div className="p-6 text-center text-neutral-400">Memuat...</div>;

  const { suggestion, log } = data;
  const alreadyChosen = log.plan;

  return (
    <div className="space-y-4 p-4">
      <h1 className="pt-2 text-xl font-bold">🎯 Rencana Hari Ini</h1>

      {alreadyChosen && (
        <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
          Kamu sudah pilih <b>{alreadyChosen === "if" ? "Intermittent Fasting" : "Defisit Kalori"}</b> hari ini.
          Pilih lagi kalau mau ganti.
        </div>
      )}

      <p className="rounded-xl bg-white px-4 py-3 text-sm text-neutral-600 shadow-sm dark:bg-neutral-900 dark:text-neutral-300">
        💡 {suggestion.reason}
      </p>

      <button
        onClick={() => choose("if")}
        disabled={saving !== null}
        className={`w-full rounded-2xl border-2 p-4 text-left ${
          suggestion.recommended === "if"
            ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40"
            : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold">⏱️ Intermittent Fasting</span>
          {suggestion.recommended === "if" && (
            <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">Rekomendasi</span>
          )}
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          Window makan singkat mulai dari sekarang. Cocok kalau bangun siang / mau lebih simpel.
        </p>
      </button>

      <button
        onClick={() => choose("deficit")}
        disabled={saving !== null}
        className={`w-full rounded-2xl border-2 p-4 text-left ${
          suggestion.recommended === "deficit"
            ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40"
            : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="font-semibold">🍽️ Defisit Kalori</span>
          {suggestion.recommended === "deficit" && (
            <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">Rekomendasi</span>
          )}
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          3 meal terjadwal seharian, tetap di bawah target kalori. Cocok kalau bangun pagi.
        </p>
      </button>
    </div>
  );
}
