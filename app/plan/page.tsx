"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { DayLog, PlanType } from "@/lib/types";
import { IconClock, IconBowl, IconSparkle } from "@/components/icons";

interface Suggestion {
  recommended: PlanType;
  reason: string;
}

interface PlanResponse {
  log: DayLog;
  suggestion: Suggestion | null;
  defaultWakeTime: string; // "HH:MM"
}

export default function PlanPage() {
  const router = useRouter();
  const [data, setData] = useState<PlanResponse | null>(null);
  const [wakeInput, setWakeInput] = useState("");
  const [savingWake, setSavingWake] = useState(false);
  const [savingPlan, setSavingPlan] = useState<PlanType | null>(null);

  useEffect(() => {
    fetch("/api/plan")
      .then((r) => r.json())
      .then((d: PlanResponse) => {
        setData(d);
        setWakeInput(d.defaultWakeTime);
      });
  }, []);

  async function submitWakeTime(e: React.FormEvent) {
    e.preventDefault();
    setSavingWake(true);
    try {
      const res = await fetch("/api/plan/wake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ time: wakeInput }),
      });
      const d = await res.json();
      setData((prev) => (prev ? { ...prev, log: d.log, suggestion: d.suggestion } : prev));
    } finally {
      setSavingWake(false);
    }
  }

  async function choose(plan: PlanType) {
    setSavingPlan(plan);
    try {
      await fetch("/api/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      router.push("/");
    } finally {
      setSavingPlan(null);
    }
  }

  if (!data) return <div className="p-6 text-center text-neutral-400">Memuat...</div>;

  const { log, suggestion } = data;

  return (
    <div className="space-y-4 p-4">
      <h1 className="pt-2 text-xl font-bold">Rencana Hari Ini</h1>

      <section className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <IconClock className="h-4 w-4 text-brand-600 dark:text-brand-400" /> Jam berapa kamu bangun tadi?
        </div>
        <form onSubmit={submitWakeTime} className="flex gap-2">
          <input
            type="time"
            value={wakeInput}
            onChange={(e) => setWakeInput(e.target.value)}
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
          />
          <button
            type="submit"
            disabled={savingWake}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {savingWake ? "..." : log.wakeTime ? "Ubah" : "Simpan"}
          </button>
        </form>
        {log.wakeTime && (
          <p className="text-xs text-neutral-500">
            Tersimpan: bangun jam {wakeInput}. Ganti jam di atas kalau salah.
          </p>
        )}
      </section>

      {suggestion && (
        <>
          {log.plan && (
            <div className="rounded-xl bg-brand-50 px-4 py-3 text-sm text-brand-700 dark:bg-brand-950/40 dark:text-brand-300">
              Kamu sudah pilih <b>{log.plan === "if" ? "Intermittent Fasting" : "Defisit Kalori"}</b> hari ini.
              Pilih lagi kalau mau ganti.
            </div>
          )}

          <p className="flex gap-2 rounded-xl border-l-2 border-brand-400 bg-white px-4 py-3 text-sm text-neutral-600 shadow-sm dark:bg-neutral-900 dark:text-neutral-300">
            <IconSparkle className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
            {suggestion.reason}
          </p>

          <button
            onClick={() => choose("if")}
            disabled={savingPlan !== null}
            className={`w-full rounded-2xl border-2 p-4 text-left ${
              suggestion.recommended === "if"
                ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40"
                : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold">
                <IconClock className="h-4 w-4 text-brand-600 dark:text-brand-400" /> Intermittent Fasting
              </span>
              {suggestion.recommended === "if" && (
                <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">Rekomendasi</span>
              )}
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              Window makan singkat mulai dari jam bangun. Cocok kalau bangun siang / mau lebih simpel.
            </p>
          </button>

          <button
            onClick={() => choose("deficit")}
            disabled={savingPlan !== null}
            className={`w-full rounded-2xl border-2 p-4 text-left ${
              suggestion.recommended === "deficit"
                ? "border-brand-500 bg-brand-50 dark:bg-brand-950/40"
                : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-semibold">
                <IconBowl className="h-4 w-4 text-brand-600 dark:text-brand-400" /> Defisit Kalori
              </span>
              {suggestion.recommended === "deficit" && (
                <span className="rounded-full bg-brand-500 px-2 py-0.5 text-xs text-white">Rekomendasi</span>
              )}
            </div>
            <p className="mt-1 text-sm text-neutral-500">
              3 meal terjadwal seharian, tetap di bawah target kalori. Cocok kalau bangun pagi.
            </p>
          </button>
        </>
      )}
    </div>
  );
}
