"use client";

import type { BodyResponseReport } from "@/lib/bodyResponse";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DayLog, UserSettings } from "@/lib/types";
import type { Challenge } from "@/lib/challenges";
import { TARGET_FEEDBACK_MIN_RATIO } from "@/lib/energy";
import type { DaySummary, WeeklyBudget } from "@/lib/day";
import type { WeightTrend } from "@/lib/weight";
import type { HealthScore } from "@/lib/healthScore";
import type { HabitStrategy } from "@/lib/habits";
import { buildAdaptiveCoach, type CoachMoment } from "@/lib/adaptiveCoach";
import {
  IconCamera,
  IconSearch,
  IconScaleWeight,
  IconTarget,
  IconRuler,
  IconCalendarCheck,
  IconChartBar,
} from "@/components/icons";
import DailyCoach from "@/components/DailyCoach";
import Mascot, { type MascotMood } from "@/components/Mascot";
import CalorieRing from "@/components/CalorieRing";
import FeatureCard from "@/components/ui/FeatureCard";
import SkyBackdrop, { skyBackground } from "@/components/SkyBackdrop";
import { skyForHour } from "@/lib/skyTheme";
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
  bodyResponse?: BodyResponseReport;
  weightTrend: WeightTrend;
  proteinToday: number;
  healthScore: HealthScore;
  habits: HabitStrategy;
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<TodayResponse | null>(null);
  const [burnLabel, setBurnLabel] = useState("");
  const [burnKcal, setBurnKcal] = useState("");
  const [savingBurn, setSavingBurn] = useState(false);
  const [showBurnForm, setShowBurnForm] = useState(false);
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const [coachMoment, setCoachMoment] = useState<CoachMoment>("neutral");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/today");
      if (!res.ok)
        throw new Error(
          "Data hari ini belum bisa dimuat. Cek koneksimu lalu coba lagi.",
        );
      setData(await res.json());
      return true;
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Gagal memuat data hari ini.",
      );
      return false;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const needsOnboarding = data !== null && !data.settings.programConfigured;
  useEffect(() => {
    if (needsOnboarding) router.replace("/onboarding");
  }, [needsOnboarding, router]);

  async function toggleFoodLogComplete() {
    if (!data) return;
    setSavingCompletion(true);
    setCompletionError("");
    try {
      const response = await fetch("/api/log", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodLogComplete: !data.log.foodLogComplete }),
      });
      if (!response.ok)
        throw new Error("Belum tersimpan. Coba lagi ya.");
      if (!(await load()))
        throw new Error(
          "Tersimpan, tapi tampilannya belum diperbarui. Tarik ulang halamannya.",
        );
    } catch (error) {
      setCompletionError(
        error instanceof Error ? error.message : "Belum bisa menyimpan.",
      );
    } finally {
      setSavingCompletion(false);
    }
  }

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
        body: JSON.stringify({
          type: "burn",
          calories,
          label: burnLabel || "Aktivitas",
          source: "manual",
        }),
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

  if (!data || needsOnboarding)
    return loadError ? (
      <div className="space-y-3 p-4">
        <p role="alert" className="text-sm text-red-500">
          {loadError}
        </p>
        <button
          type="button"
          onClick={() => void load()}
          className="rounded-lg border border-neutral-300 px-3 py-2 text-sm"
        >
          Coba lagi
        </button>
      </div>
    ) : (
      <div className="p-6 text-center text-neutral-400">Memuat...</div>
    );

  const {
    summary,
    log,
    streak,
    challenge,
    weeklyBudget,
    weightTrend,
    proteinToday,
    healthScore,
    settings,
    habits,
  } = data;
  const fresh = (data.bodyResponse?.current.food.observedDays ?? 0) === 0 && streak === 0;
  const over = summary.caloriesIn > summary.target;
  const surplus = Math.max(0, summary.caloriesIn - summary.target);
  const onTrack = summary.onTrack && healthScore.total >= 60;
  const proteinPct = Math.min(
    100,
    Math.round((proteinToday / settings.proteinTargetG) * 100),
  );
  const coach = buildAdaptiveCoach({
    bodyResponse: data.bodyResponse,
    log,
    summary,
    weeklyBudget,
    weightTrend,
    proteinToday,
    settings,
    habits,
    moment: coachMoment,
  });

  const hour = new Date().getHours();
  const sky = skyForHour(hour);
  const greeting =
    hour < 5 ? "Selamat malam" : hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 19 ? "Selamat sore" : "Selamat malam";
  const mood: MascotMood = over
    ? "full"
    : summary.foodLogStatus === "complete" && onTrack
      ? "cheer"
      : summary.foodLogStatus === "empty"
        ? "neutral"
        : "happy";
  const statusLine =
    summary.foodLogStatus !== "complete"
      ? "Hari ini masih jalan"
      : onTrack
        ? "Hari ini on track"
        : "Yuk cek lagi sebentar";

  return (
    <div className="pb-4">
      {loadError && (
        <p role="alert" className="p-4 text-sm text-red-500">
          {loadError}
        </p>
      )}
      <section
        className="relative isolate overflow-hidden rounded-b-[2rem] px-4 pb-6 pt-6 text-white shadow-xs"
        style={{ background: skyBackground(sky) }}
      >
        <SkyBackdrop sky={sky} />
        <div className="relative z-10">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm text-white/80">
              {greeting}
              {data.userName ? `, ${data.userName}` : ""}
            </p>
            <h1 className="text-xl font-semibold">{statusLine}</h1>
          </div>
          <div className="shrink-0 rounded-full bg-white/15 px-3 py-1 text-sm font-medium">
            🔥 {streak} hari
          </div>
        </header>

        <div className="mt-5 flex items-center gap-3">
          <CalorieRing eaten={summary.caloriesIn} target={summary.target} className="h-40 w-40 shrink-0" />
          <div className="flex min-w-0 flex-1 flex-col items-center">
            <Mascot mood={mood} className="h-20 w-20" />
            <p className="mt-1 line-clamp-3 rounded-2xl bg-white/15 px-3 py-2 text-center text-xs leading-snug">
              {fresh && log.meals.length === 0 ? "Yuk, mulai dari makan pertamamu." : coach.headline}
            </p>
          </div>
        </div>

        <div className="mt-4 flex items-center justify-between text-sm text-white/80">
          <span>
            {summary.caloriesIn} / {summary.target} kcal
          </span>
          <span>
            Protein {proteinToday} / {settings.proteinTargetG} g
          </span>
        </div>
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-white/20">
          <div className="h-full rounded-full bg-white" style={{ width: `${proteinPct}%` }} />
        </div>

        <Link
          href="/makan"
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-white py-3.5 font-semibold text-brand-700 shadow-xs"
        >
          <IconCamera className="h-5 w-5" />
          Catat makan
        </Link>
        </div>
      </section>

      <div className="space-y-4 p-4">
      {!fresh && !log.plan && (
        <Link
          href="/plan"
          className="block rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-center text-sm font-medium text-brand-700 dark:border-brand-900 dark:bg-brand-900/20 dark:text-brand-300"
        >
          Baru bangun? Pilih rencana hari ini →
        </Link>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Link
          href="/makan?mode=cari"
          className="flex items-center justify-center gap-2 rounded-2xl bg-white p-3 text-sm font-medium shadow-xs dark:bg-neutral-900"
        >
          <IconSearch className="h-5 w-5 text-orange-500" />
          Aku lapar
        </Link>
        <button
          onClick={() => setShowWeightForm((v) => !v)}
          className="flex items-center justify-center gap-2 rounded-2xl bg-white p-3 text-sm font-medium shadow-xs dark:bg-neutral-900"
        >
          <IconScaleWeight className="h-5 w-5 text-sky-500" />
          Catat berat
        </button>
      </div>

      {showWeightForm && (
        <form
          onSubmit={saveWeight}
          className="flex items-center gap-2 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"
        >
          <input
            autoFocus
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            inputMode="decimal"
            placeholder="78.4"
            className="flex-1 rounded-lg border border-neutral-300 px-3 py-2 text-center text-lg dark:border-neutral-700 dark:bg-neutral-800"
          />
          <span className="text-neutral-500">kg</span>
          <button
            type="submit"
            disabled={savingWeight || !weightInput}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {savingWeight ? "..." : "Simpan"}
          </button>
        </form>
      )}

      {fresh ? (
        <GettingStarted hasMeal={log.meals.length > 0} closed={Boolean(log.foodLogComplete)} />
      ) : (
        <DailyCoach
          coach={coach}
          moment={coachMoment}
          onMomentChange={setCoachMoment}
        />
      )}

      <section>
        <h2 className="mb-2 px-1 text-sm font-semibold">Fitur kamu</h2>
        <div className="grid grid-cols-2 gap-3">
          <FeatureCard
            href="/progress?tab=body"
            icon={<IconScaleWeight className="h-5 w-5" />}
            label="Berat badan"
            value={weightTrend.today !== null ? `${weightTrend.today} kg` : "Belum ada"}
            caption={
              weightTrend.weeklyRate !== null
                ? `${weightTrend.weeklyRate > 0 ? "+" : ""}${weightTrend.weeklyRate} kg per minggu`
                : daysSince(data.bodyResponse?.current.weight.last?.date, data.date) === null
                  ? "Timbang pertamamu"
                  : "Belum ada tren"
            }
            chip={due(daysSince(data.bodyResponse?.current.weight.last?.date, data.date), 3)}
          />
          <FeatureCard
            href="/progress?tab=body"
            icon={<IconRuler className="h-5 w-5" />}
            tone="violet"
            label="Lingkar pinggang"
            value={
              data.bodyResponse?.current.waist.last
                ? `${data.bodyResponse.current.waist.last.value} cm`
                : "Belum ada"
            }
            caption={
              daysSince(data.bodyResponse?.current.waist.last?.date, data.date) === null
                ? "Ukur pertama kali"
                : `${
                    settings.heightCm && data.bodyResponse?.current.waist.last
                      ? `Rasio ${(data.bodyResponse.current.waist.last.value / settings.heightCm).toFixed(2).replace(".", ",")} (patokan < 0,5) · `
                      : ""
                  }${daysSince(data.bodyResponse?.current.waist.last?.date, data.date)} hari lalu`
            }
            chip={due(daysSince(data.bodyResponse?.current.waist.last?.date, data.date), 7)}
          />
          {!fresh && (
            <FeatureCard
              href="/progress"
              icon={<IconCalendarCheck className="h-5 w-5" />}
              tone="amber"
              label="Minggu ini"
              value={`${Math.max(0, weeklyBudget.remaining).toLocaleString("id-ID")} kcal`}
              caption={`${weeklyBudget.completedDays}/${weeklyBudget.totalDays} hari lengkap${weeklyBudget.isComplete ? "" : " · sementara"}`}
            />
          )}
          <FeatureCard
            href="/makan/restaurant"
            icon={<IconSearch className="h-5 w-5" />}
            tone="orange"
            label="Makan di luar"
            value="Menu restoran"
            caption="Pilih yang pas buat sisa kalorimu"
            wide={fresh}
          />
          {!fresh && (
            <FeatureCard
              href="/makan/habits"
              icon={<IconChartBar className="h-5 w-5" />}
              tone="sky"
              label="Kebiasaan"
              value="Menu favorit"
              caption="Dipelajari dari catatanmu"
              wide
            />
          )}
        </div>
      </section>

      {(!fresh || log.meals.length > 0) && (
      <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="text-sm font-semibold">Tutup hari</div>
        <div className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-300">
          {summary.foodLogStatus === "complete"
            ? "Catatan hari ini sudah lengkap"
            : summary.foodLogStatus === "partial"
              ? "Baru sebagian yang tercatat"
              : "Belum ada yang dicatat"}
        </div>
        <p className="mt-1 text-xs text-neutral-500">
          Kalau semua makan dan minum hari ini sudah kamu catat, tutup harinya di sini. Streak
          dihitung dari hari yang catatannya lengkap, bukan dari seberapa sedikit kamu makan.
        </p>
        {!log.foodLogComplete && log.meals.length > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-900/20 dark:text-amber-200">
            <span>Sudah catat minuman, camilan, dan minyak atau saus?</span>
            <Link href="/makan" className="shrink-0 font-semibold underline underline-offset-2">
              Catat
            </Link>
          </div>
        )}
        <button
          type="button"
          onClick={toggleFoodLogComplete}
          disabled={savingCompletion}
          className={`mt-3 w-full rounded-xl py-2.5 text-sm font-medium disabled:opacity-50 ${
            log.foodLogComplete
              ? "border border-neutral-300 dark:border-neutral-700"
              : "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900"
          }`}
        >
          {savingCompletion
            ? "Menyimpan..."
            : log.foodLogComplete
              ? "Buka lagi catatannya"
              : "Sudah semua, tutup hari"}
        </button>
        {completionError && (
          <p role="alert" className="mt-2 text-sm text-red-500">
            {completionError}
          </p>
        )}
        {summary.foodLogStatus === "complete" &&
          summary.caloriesIn < summary.target * TARGET_FEEDBACK_MIN_RATIO && (
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">
              Yang tercatat jauh di bawah target. Pastikan nggak ada yang kelewat;
              makan lebih sedikit belum tentu lebih baik.
            </p>
          )}
        <p className="mt-3 text-xs text-neutral-400">
          Skor kebiasaan hari ini: {healthScore.total}/100. Ini perkiraan dari app, bukan penilaian medis.
          {log.plan === "if" && log.eatingWindowStart && log.eatingWindowHours
            ? ` Mode puasa intermiten: jendela makan ${log.eatingWindowHours} jam sejak bangun.`
            : ""}
        </p>
      </section>
      )}

      <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <IconTarget className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" />
            <div>
              <div className="text-sm font-semibold">Misi Hari Ini</div>
              <div className="text-sm text-neutral-500">{challenge.label}</div>
            </div>
          </div>
          <button
            onClick={toggleChallenge}
            aria-label="Tandai misi selesai"
            className={`h-8 w-8 shrink-0 rounded-full border-2 text-lg ${log.challengeDone ? "border-brand-500 bg-brand-500 text-white" : "border-neutral-300 text-transparent dark:border-neutral-700"}`}
          >
            ✓
          </button>
        </div>
      </section>

      {over && <RecoveryMode surplusKcal={surplus} />}

      <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <button
          onClick={() => setShowBurnForm((v) => !v)}
          className="flex w-full items-center justify-between text-sm font-medium text-neutral-500"
        >
          Catat aktivitas manual
          <span className="text-neutral-400">{showBurnForm ? "−" : "+"}</span>
        </button>
        {showBurnForm && (
          <form onSubmit={addBurn} className="mt-3 flex gap-2">
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
        )}
      </section>
      </div>
    </div>
  );
}

function GettingStarted({ hasMeal, closed }: { hasMeal: boolean; closed: boolean }) {
  const steps = [
    { label: "Target kalori sudah diatur", done: true },
    { label: "Catat makan pertamamu", done: hasMeal },
    { label: "Tutup hari setelah semua makan tercatat", done: closed },
  ];
  return (
    <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      <div className="text-sm font-semibold">Mulai dari sini</div>
      <ul className="mt-3 space-y-2.5">
        {steps.map((step) => (
          <li key={step.label} className="flex items-center gap-3 text-sm">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${
                step.done ? "bg-brand-600 text-white" : "border border-neutral-300 text-transparent dark:border-neutral-700"
              }`}
            >
              ✓
            </span>
            <span className={step.done ? "text-neutral-400 line-through" : "font-medium"}>{step.label}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-neutral-500">
        Saran harian baru muncul setelah beberapa hari catatan. Sementara itu, cukup catat makan dan tutup hari.
      </p>
    </section>
  );
}

// Whole days between a YYYY-MM-DD measurement date and today's date, or null.
function daysSince(date: string | undefined, today: string): number | null {
  if (!date) return null;
  return Math.max(0, Math.round((Date.parse(today) - Date.parse(date)) / 86400000));
}

function due(days: number | null, everyDays: number): string | undefined {
  return days === null || days >= everyDays ? "Waktunya" : undefined;
}
