"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { DayLog, UserSettings } from "@/lib/types";
import type { Challenge } from "@/lib/challenges";
import type { DaySummary } from "@/lib/day";
import ExerciseCredit from "@/components/ExerciseCredit";

interface TodayResponse {
  date: string;
  log: DayLog;
  summary: DaySummary;
  settings: UserSettings;
  streak: number;
  challenge: Challenge;
}

export default function DashboardPage() {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [burnLabel, setBurnLabel] = useState("");
  const [burnKcal, setBurnKcal] = useState("");
  const [savingBurn, setSavingBurn] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/today");
    if (res.ok) setData(await res.json());
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function toggleChallenge() {
    if (!data) return;
    const done = !data.log.challengeDone;
    setData({ ...data, log: { ...data.log, challengeDone: done } });
    await fetch("/api/challenge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done }),
    });
    load();
  }

  async function addBurn(e: React.FormEvent) {
    e.preventDefault();
    const calories = Number(burnKcal);
    if (!calories || calories <= 0) return;
    setSavingBurn(true);
    try {
      await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "burn", calories, label: burnLabel || "Aktivitas", source: "manual" }),
      });
      setBurnLabel("");
      setBurnKcal("");
      await load();
    } finally {
      setSavingBurn(false);
    }
  }

  async function removeEntry(type: "meal" | "burn", id: string) {
    await fetch(`/api/log?type=${type}&id=${id}`, { method: "DELETE" });
    load();
  }

  if (!data) {
    return <div className="p-6 text-center text-neutral-400">Memuat...</div>;
  }

  const { summary, log, streak, challenge } = data;
  const pct = Math.min(100, Math.max(0, (summary.net / summary.target) * 100));
  const over = summary.net > summary.target;

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-center justify-between pt-2">
        <h1 className="text-xl font-bold text-brand-700 dark:text-brand-400">menuju kurus</h1>
        <div className="flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
          🔥 {streak} hari streak
        </div>
      </header>

      {!log.plan && (
        <Link
          href="/plan"
          className="block rounded-xl bg-brand-600 px-4 py-3 text-center font-medium text-white"
        >
          Baru bangun? Pilih rencana hari ini →
        </Link>
      )}

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm text-neutral-500">Kalori bersih hari ini</span>
          <span className={`text-sm font-medium ${over ? "text-red-500" : "text-brand-600"}`}>
            {summary.net} / {summary.target} kcal
          </span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div
            className={`h-full rounded-full ${over ? "bg-red-500" : "bg-brand-500"}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-semibold">{summary.caloriesIn}</div>
            <div className="text-xs text-neutral-500">Masuk</div>
          </div>
          <div>
            <div className="text-lg font-semibold">{summary.caloriesOut}</div>
            <div className="text-xs text-neutral-500">Terbakar</div>
          </div>
          <div>
            <div className={`text-lg font-semibold ${over ? "text-red-500" : ""}`}>
              {summary.remaining >= 0 ? summary.remaining : 0}
            </div>
            <div className="text-xs text-neutral-500">Sisa budget</div>
          </div>
        </div>
        {log.plan === "if" && log.eatingWindowStart && log.eatingWindowHours && (
          <p className="mt-3 text-center text-xs text-neutral-500">
            Mode Intermittent Fasting · window makan {log.eatingWindowHours} jam sejak bangun
          </p>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">🎯 Tantangan hari ini</div>
            <div className="text-sm text-neutral-500">{challenge.label}</div>
          </div>
          <button
            onClick={toggleChallenge}
            className={`h-8 w-8 shrink-0 rounded-full border-2 text-lg ${
              log.challengeDone
                ? "border-brand-500 bg-brand-500 text-white"
                : "border-neutral-300 text-transparent dark:border-neutral-700"
            }`}
          >
            ✓
          </button>
        </div>
      </section>

      {over && <ExerciseCredit extraKcal={summary.net - summary.target} />}

      <Link
        href="/log-food"
        className="block rounded-xl border-2 border-dashed border-brand-400 px-4 py-4 text-center font-medium text-brand-600 dark:text-brand-400"
      >
        📷 Foto makanan untuk cek kalori
      </Link>

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <div className="mb-2 text-sm font-medium">Catat kalori keluar manual</div>
        <form onSubmit={addBurn} className="flex gap-2">
          <input
            value={burnLabel}
            onChange={(e) => setBurnLabel(e.target.value)}
            placeholder="Aktivitas (opsional)"
            className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
          <input
            value={burnKcal}
            onChange={(e) => setBurnKcal(e.target.value)}
            placeholder="kcal"
            inputMode="numeric"
            className="w-20 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
          />
          <button
            type="submit"
            disabled={savingBurn}
            className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            +
          </button>
        </form>
      </section>

      {(log.meals.length > 0 || log.burns.length > 0) && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-medium text-neutral-500">Riwayat hari ini</h2>
          {[...log.meals.map((m) => ({ ...m, kind: "meal" as const })), ...log.burns.map((b) => ({ ...b, kind: "burn" as const }))]
            .sort((a, b) => a.time.localeCompare(b.time))
            .map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between rounded-xl bg-white px-4 py-3 shadow-sm dark:bg-neutral-900"
              >
                <div>
                  <div className="text-sm font-medium">
                    {entry.kind === "meal" ? "🍽️ " + entry.foodName : "🔥 " + entry.label}
                  </div>
                  <div className="text-xs text-neutral-500">
                    {new Date(entry.time).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={entry.kind === "meal" ? "text-sm font-medium" : "text-sm font-medium text-brand-600"}>
                    {entry.kind === "meal" ? "+" : "-"}
                    {entry.calories} kcal
                  </span>
                  <button
                    onClick={() => removeEntry(entry.kind, entry.id)}
                    className="text-neutral-300 hover:text-red-400"
                    aria-label="Hapus"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
        </section>
      )}
    </div>
  );
}
