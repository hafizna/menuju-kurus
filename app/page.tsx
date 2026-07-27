"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import type { DayLog, UserSettings } from "@/lib/types";
import type { Challenge } from "@/lib/challenges";
import type { DaySummary, WeeklyBudget } from "@/lib/day";
import type { WeightTrend } from "@/lib/weight";
import type { HealthScore } from "@/lib/healthScore";
import { buildDailyCoach } from "@/lib/dailyCoach";
import { IconCamera, IconSearch, IconScaleWeight } from "@/components/icons";
import ExerciseCredit from "@/components/ExerciseCredit";
import DailyCoach from "@/components/DailyCoach";
import RecoveryMode from "@/components/RecoveryMode";

interface TodayResponse {
  date: string;
  log: DayLog;
  summary: DaySummary;
  settings: UserSettings;
  streak: number;
  challenge: Challenge;
  userName: string;
  weeklyBudget: WeeklyBudget;
  weightTrend: WeightTrend;
  proteinToday: number;
  healthScore: HealthScore;
}

export default function DashboardPage() {
  const [data, setData] = useState<TodayResponse | null>(null);
  const [burnLabel, setBurnLabel] = useState("");
  const [burnKcal, setBurnKcal] = useState("");
  const [savingBurn, setSavingBurn] = useState(false);
  const [showBurnForm, setShowBurnForm] = useState(false);
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);

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
      setShowBurnForm(false);
      await load();
    } finally {
      setSavingBurn(false);
    }
  }

  async function saveWeight(e: React.FormEvent) {
    e.preventDefault();
    const weightKg = Number(weightInput);
    if (!weightKg || weightKg <= 0) return;
    setSavingWeight(true);
    try {
      await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weightKg }),
      });
      setWeightInput("");
      setShowWeightForm(false);
      await load();
    } finally {
      setSavingWeight(false);
    }
  }

  if (!data) return <div className="p-6 text-center text-neutral-400">Memuat...</div>;

  const { summary, log, streak, challenge, weeklyBudget, weightTrend, proteinToday, healthScore, settings } = data;
  const pct = Math.min(100, Math.max(0, (summary.net / summary.target) * 100));
  const over = summary.net > summary.target;
  const surplus = Math.max(0, summary.net - summary.target);
  const onTrack = healthScore.total >= 60;
  const proteinRemaining = Math.max(0, settings.proteinTargetG - proteinToday);
  const proteinPct = Math.min(100, Math.round((proteinToday / settings.proteinTargetG) * 100));
  const coach = buildDailyCoach({ log, summary, weeklyBudget, weightTrend, proteinToday, settings });

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-center justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold text-brand-700 dark:text-brand-400">menuju kurus</h1>
          {data.userName && <p className="text-xs text-neutral-400">Halo, {data.userName}</p>}
        </div>
        <div className="flex items-center gap-1 rounded-full bg-orange-100 px-3 py-1 text-sm font-medium text-orange-700 dark:bg-orange-950 dark:text-orange-300">
          🔥 {streak} hari streak
        </div>
      </header>

      {!log.plan && (
        <Link href="/plan" className="block rounded-xl bg-brand-600 px-4 py-3 text-center font-medium text-white">
          Baru bangun? Pilih rencana hari ini →
        </Link>
      )}

      {/* Status hari ini */}
      <section className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-4 text-white shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-brand-100">Status Hari Ini</div>
            <div className="text-lg font-bold">{onTrack ? "🟢 On Track" : "🟠 Perlu Perhatian"}</div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{healthScore.total}</div>
            <div className="text-xs text-brand-100">Health Score /100</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/20 pt-3">
          <div>
            <div className="text-lg font-semibold">{Math.max(0, summary.remaining)} kcal</div>
            <div className="text-xs text-brand-100">Sisa kalori</div>
          </div>
          <div>
            <div className="text-lg font-semibold">{proteinRemaining} g</div>
            <div className="text-xs text-brand-100">Sisa protein</div>
          </div>
        </div>
      </section>

      {/* Tiga tindakan utama */}
      <div className="grid grid-cols-3 gap-2">
        <Link href="/makan" className="flex flex-col items-center gap-1.5 rounded-2xl bg-white p-3 text-center shadow-sm dark:bg-neutral-900">
          <IconCamera className="h-5 w-5 text-brand-600" />
          <span className="text-xs font-medium">Catat Makan</span>
        </Link>
        <Link href="/makan?mode=cari" className="flex flex-col items-center gap-1.5 rounded-2xl bg-white p-3 text-center shadow-sm dark:bg-neutral-900">
          <IconSearch className="h-5 w-5 text-brand-600" />
          <span className="text-xs font-medium">Aku Lapar</span>
        </Link>
        <button
          onClick={() => setShowWeightForm((v) => !v)}
          className="flex flex-col items-center gap-1.5 rounded-2xl bg-white p-3 text-center shadow-sm dark:bg-neutral-900"
        >
          <IconScaleWeight className="h-5 w-5 text-brand-600" />
          <span className="text-xs font-medium">Catat Berat</span>
        </button>
      </div>

      {showWeightForm && (
        <form onSubmit={saveWeight} className="flex items-center gap-2 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
          <input
            autoFocus
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            inputMode="decimal"
            placeholder="78.4"
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-center text-lg dark:border-neutral-700 dark:bg-neutral-800"
          />
          <span className="text-neutral-500">kg</span>
          <button type="submit" disabled={savingWeight || !weightInput} className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">
            {savingWeight ? "..." : "Simpan"}
          </button>
        </form>
      )}

      <DailyCoach coach={coach} />

      <div className="grid grid-cols-2 gap-3">
        <Link href="/progress?tab=weight" className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
          <div className="text-xs text-neutral-500">Tren Berat</div>
          {weightTrend.today !== null ? (
            <>
              <div className="text-lg font-bold">{weightTrend.today} kg</div>
              <div className={`text-xs ${weightTrend.direction === "down" ? "text-brand-600" : weightTrend.direction === "up" ? "text-red-500" : "text-neutral-400"}`}>
                {weightTrend.weeklyRate !== null ? `${weightTrend.weeklyRate > 0 ? "+" : ""}${weightTrend.weeklyRate} kg/mgg` : "belum ada tren"}
              </div>
            </>
          ) : (
            <div className="text-sm text-brand-600">+ Timbang sekarang</div>
          )}
        </Link>

        <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
          <div className="text-xs text-neutral-500">Minggu Ini</div>
          <div className={`text-lg font-bold ${weeklyBudget.remaining < 0 ? "text-red-500" : ""}`}>
            {weeklyBudget.remaining >= 0 ? weeklyBudget.remaining.toLocaleString("id-ID") : 0}
          </div>
          <div className="text-xs text-neutral-400">kcal tersisa / minggu</div>
        </div>
      </div>

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm text-neutral-500">Kalori bersih hari ini</span>
          <span className={`text-sm font-medium ${over ? "text-red-500" : "text-brand-600"}`}>{summary.net} / {summary.target} kcal</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div className={`h-full rounded-full ${over ? "bg-red-500" : "bg-brand-500"}`} style={{ width: `${pct}%` }} />
        </div>
        {log.plan === "if" && log.eatingWindowStart && log.eatingWindowHours && (
          <p className="mt-3 text-center text-xs text-neutral-500">Mode Intermittent Fasting · window makan {log.eatingWindowHours} jam sejak bangun</p>
        )}
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-sm text-neutral-500">Protein hari ini</span>
          <span className="text-sm font-medium">{proteinToday} / {settings.proteinTargetG} g</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800">
          <div className="h-full rounded-full bg-blue-500" style={{ width: `${proteinPct}%` }} />
        </div>
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <div className="flex items-center justify-between">
          <div><div className="text-sm font-medium">🎯 Misi Hari Ini</div><div className="text-sm text-neutral-500">{challenge.label}</div></div>
          <button onClick={toggleChallenge} aria-label="Tandai misi selesai" className={`h-8 w-8 shrink-0 rounded-full border-2 text-lg ${log.challengeDone ? "border-brand-500 bg-brand-500 text-white" : "border-neutral-300 text-transparent dark:border-neutral-700"}`}>✓</button>
        </div>
      </section>

      {over && <RecoveryMode surplusKcal={surplus} />}
      {over && <ExerciseCredit extraKcal={surplus} />}

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <button
          onClick={() => setShowBurnForm((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-medium text-neutral-500"
        >
          Catat kalori keluar manual
          <span className="text-neutral-400">{showBurnForm ? "−" : "+"}</span>
        </button>
        {showBurnForm && (
          <form onSubmit={addBurn} className="mt-3 flex gap-2">
            <input value={burnLabel} onChange={(e) => setBurnLabel(e.target.value)} placeholder="Aktivitas (opsional)" className="min-w-0 flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800" />
            <input value={burnKcal} onChange={(e) => setBurnKcal(e.target.value)} placeholder="kcal" inputMode="numeric" className="w-20 rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800" />
            <button type="submit" disabled={savingBurn} className="rounded-lg bg-brand-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">+</button>
          </form>
        )}
      </section>
    </div>
  );
}
