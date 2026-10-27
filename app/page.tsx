"use client";

import { useEffect, useState, useCallback, useRef, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { DayLog, UserSettings } from "@/lib/types";
import type { Challenge } from "@/lib/challenges";
import type { DaySummary, WeeklyBudget } from "@/lib/day";
import type { WeightTrend } from "@/lib/weight";
import type { BodyResponseReport } from "@/lib/bodyResponse";
import type { HabitStrategy } from "@/lib/habits";
import { buildAdaptiveCoach, type CoachMoment } from "@/lib/adaptiveCoach";
import { IconCamera, IconSearch, IconScaleWeight, IconTarget, IconBowl } from "@/components/icons";
import DailyCoach from "@/components/DailyCoach";
import Mascot from "@/components/Mascot";
import SkyBackdrop, { skyBackground } from "@/components/SkyBackdrop";
import WeeklyFocusCard from "@/components/WeeklyFocusCard";
import { skyForHour } from "@/lib/skyTheme";
import RecoveryMode from "@/components/RecoveryMode";
import { sugarNote, type DaySugar, type WeekSugar } from "@/lib/sugar";
import { buildMascotScenes, pickNextScene, type MascotScene } from "@/lib/mascotScene";
import type { MascotMood } from "@/components/Mascot";
import { buildHomeHero } from "@/lib/homeHero";
import { formatMeasure } from "@/lib/format";
import ActivityCard from "@/components/ActivityCard";

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
  sugarToday: DaySugar;
  sugarWeek: WeekSugar;
  habits: HabitStrategy;
}

async function checkSaved(response: Response, fallback: string) {
  if (response.ok) return;
  const body = await response.json().catch(() => null);
  throw new Error(body?.error || fallback);
}

function zonedHour(date: Date, timezone: string): number {
  try { return Number(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hourCycle: "h23" }).format(date)); }
  catch { return Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Jakarta", hour: "2-digit", hourCycle: "h23" }).format(date)); }
}

function mealTime(value: string, timezone: string): string {
  if (/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) return value.replace(":", ".");
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Jam belum tercatat";
  try { return new Intl.DateTimeFormat("id-ID", { timeZone: timezone, hour: "2-digit", minute: "2-digit" }).format(date); }
  catch { return new Intl.DateTimeFormat("id-ID", { timeZone: "Asia/Jakarta", hour: "2-digit", minute: "2-digit" }).format(date); }
}

export default function DashboardPage() {
  const router = useRouter();
  const [data, setData] = useState<TodayResponse | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [activeMood, setActiveMood] = useState<MascotMood | null>(null);
  const heroRef = useRef<HTMLElement>(null);
  // The rotation timer reads the current scenes without being recreated.
  const stage = useRef<{ scenes: MascotScene[]; shown: MascotMood | undefined }>({ scenes: [], shown: undefined });
  const [showWeightForm, setShowWeightForm] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [savingWeight, setSavingWeight] = useState(false);
  const [weightError, setWeightError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [savingCompletion, setSavingCompletion] = useState(false);
  const [completionError, setCompletionError] = useState("");
  const [savingChallenge, setSavingChallenge] = useState(false);
  const [challengeError, setChallengeError] = useState("");
  const [notice, setNotice] = useState("");
  const [coachMoment, setCoachMoment] = useState<CoachMoment>("neutral");

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const res = await fetch("/api/today");
      if (!res.ok) throw new Error("Data hari ini belum bisa dimuat. Cek koneksimu lalu coba lagi.");
      setData(await res.json());
      return true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Gagal memuat data hari ini.");
      return false;
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const hour = zonedHour(now, data?.settings.timezone ?? "Asia/Jakarta");
  // A change in context starts over from the first scene, which leads with food
  // context; afterwards the pose rotates on its own.
  useEffect(() => {
    setActiveMood(null);
  }, [hour, data?.proteinToday, data?.sugarToday.grams, data?.log.meals.length, data?.summary.foodLogStatus]);
  useEffect(() => {
    const id = setInterval(() => {
      const bounds = heroRef.current?.getBoundingClientRect();
      if (document.hidden || document.documentElement.dataset.motion === "off" || !bounds || bounds.bottom <= 0 || bounds.top >= innerHeight) return;
      const { scenes, shown } = stage.current;
      if (scenes.length > 1) setActiveMood(pickNextScene(scenes, shown).mood);
    }, 20_000);
    return () => clearInterval(id);
  }, []);

  const needsOnboarding = data !== null && !data.settings.programConfigured;
  useEffect(() => { if (needsOnboarding) router.replace("/onboarding"); }, [needsOnboarding, router]);

  async function toggleFoodLogComplete() {
    if (!data || savingCompletion) return;
    setSavingCompletion(true); setCompletionError("");
    try {
      const response = await fetch("/api/log", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ foodLogComplete: !data.log.foodLogComplete }),
      });
      await checkSaved(response, "Belum tersimpan. Coba lagi ya.");
      if (!(await load())) throw new Error("Tersimpan, tapi ringkasan belum diperbarui. Tekan Coba lagi di atas.");
    } catch (error) { setCompletionError(error instanceof Error ? error.message : "Belum bisa menyimpan."); }
    finally { setSavingCompletion(false); }
  }

  async function toggleChallenge() {
    if (!data || savingChallenge) return;
    const done = !data.log.challengeDone;
    setSavingChallenge(true); setChallengeError("");
    try {
      const response = await fetch("/api/challenge", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ done }),
      });
      await checkSaved(response, "Misi belum tersimpan. Coba lagi.");
      setData(current => current ? { ...current, log: { ...current.log, challengeDone: done } } : current);
      await load();
    } catch (error) { setChallengeError(error instanceof Error ? error.message : "Misi belum tersimpan."); }
    finally { setSavingChallenge(false); }
  }

  async function saveWeight(event: FormEvent) {
    event.preventDefault();
    const weightKg = Number(weightInput.replace(",", "."));
    if (!Number.isFinite(weightKg) || weightKg <= 0) { setWeightError("Isi berat badan dalam kg terlebih dahulu."); return; }
    setSavingWeight(true); setWeightError(""); setNotice("");
    try {
      const response = await fetch("/api/weight", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weightKg }),
      });
      await checkSaved(response, "Berat badan belum tersimpan. Isianmu tetap di sini.");
      setWeightInput(""); setShowWeightForm(false); setNotice("Berat badan tersimpan.");
      await load();
    } catch (error) { setWeightError(error instanceof Error ? error.message : "Berat badan belum tersimpan. Coba lagi."); }
    finally { setSavingWeight(false); }
  }

  if (!data || needsOnboarding) return (
    <div className="space-y-3 p-6">
      {loadError ? <><p role="alert" className="text-sm text-red-600 dark:text-red-300">{loadError}</p><button type="button" onClick={() => void load()} className="rounded-xl border border-neutral-300 px-4 py-2.5 text-sm dark:border-neutral-700">Coba lagi</button></> : <p role="status" className="text-center text-neutral-500">Memuat harimu...</p>}
    </div>
  );

  const { summary, log, streak, challenge, weeklyBudget, weightTrend, proteinToday, sugarToday, sugarWeek, settings, habits } = data;
  const fresh = (data.bodyResponse?.current.food.observedDays ?? 0) === 0 && streak === 0;
  const complete = summary.foodLogStatus === "complete";
  const evening = hour >= 18 || hour < 4;
  const sky = skyForHour(hour);
  const greeting = hour < 4 ? "Selamat malam" : hour < 11 ? "Selamat pagi" : hour < 15 ? "Selamat siang" : hour < 18 ? "Selamat sore" : "Selamat malam";
  const coach = buildAdaptiveCoach({ bodyResponse: data.bodyResponse, log, summary, weeklyBudget, weightTrend, proteinToday, sugarWeek, settings, habits, moment: coachMoment });
  const caloriesLabel = `${summary.caloriesIn} / ${summary.target} kcal`;
  const proteinLabel = `${proteinToday} / ${settings.proteinTargetG} g`;
  const intakePct = summary.target > 0 ? Math.min(100, Math.max(0, summary.caloriesIn / summary.target * 100)) : 0;
  const proteinPct = settings.proteinTargetG > 0 ? Math.min(100, Math.max(0, proteinToday / settings.proteinTargetG * 100)) : 0;
  const scenes = buildMascotScenes({ localHour: hour, mealCount: log.meals.length, caloriesIn: summary.caloriesIn, calorieTarget: summary.target, proteinToday, proteinTarget: settings.proteinTargetG, sugar: sugarToday, foodLogComplete: complete });
  const scene = scenes.find(item => item.mood === activeMood) ?? scenes[0];
  stage.current = { scenes, shown: scene.mood };
  const hero = buildHomeHero({ localHour: hour, mealCount: log.meals.length, foodLogComplete: complete, firstRun: fresh });
  const recent = [...log.meals].sort((a, b) => b.time.localeCompare(a.time)).slice(0, 3);
  const card = "home-card rounded-2xl border border-neutral-200/70 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900";

  const closeDay = (!fresh || log.meals.length > 0) && (
    <section className={`${card} ${evening && !complete ? "border-brand-200 dark:border-brand-800" : ""}`} aria-labelledby="close-day-title">
      <div className="flex items-start justify-between gap-3">
        <div><h2 id="close-day-title" className="font-semibold">Tutup hari</h2><p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">{complete ? "Catatan hari ini sudah lengkap." : summary.foodLogStatus === "partial" ? "Sudah semua makan dan minum hari ini tercatat?" : "Belum ada makanan yang tercatat hari ini."}</p></div>
        {complete && <span className="rounded-full bg-brand-100 px-2.5 py-1 text-xs text-brand-800 dark:bg-brand-900 dark:text-brand-200">Lengkap</span>}
      </div>
      {!log.foodLogComplete && log.meals.length > 0 && <p className="mt-2 text-xs leading-relaxed text-neutral-500">Cek juga minuman, camilan, serta minyak atau saus. <Link href="/makan" className="font-semibold text-brand-700 underline underline-offset-2 dark:text-brand-300">Ada yang belum dicatat?</Link></p>}
      <button type="button" onClick={toggleFoodLogComplete} disabled={savingCompletion} className={`mt-3 w-full rounded-xl px-3 py-3 text-sm font-semibold disabled:opacity-50 ${log.foodLogComplete ? "border border-neutral-300 dark:border-neutral-700" : "bg-brand-600 text-white"}`}>{savingCompletion ? "Menyimpan..." : log.foodLogComplete ? "Buka lagi catatannya" : "Sudah semua, tutup hari"}</button>
      {completionError && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-300">{completionError}</p>}
      <p className="mt-2 text-xs leading-relaxed text-neutral-500">Streak merayakan catatan yang lengkap. Kamu bisa membuka catatannya lagi kapan saja.</p>
    </section>
  );

  return (
    <div className="slothly-home space-y-5 p-4 sm:space-y-6 sm:p-0">
      {loadError && <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900 dark:bg-amber-950/30"><p role="alert" className="flex-1 text-sm text-amber-900 dark:text-amber-200">{loadError}</p><button type="button" onClick={() => void load()} className="rounded-lg border border-amber-300 px-3 py-2 text-sm font-semibold dark:border-amber-800">Coba lagi</button></div>}
      <section ref={heroRef} className="home-canopy slothly-canopy relative isolate overflow-hidden rounded-3xl px-5 py-4 sm:px-7 sm:py-5" style={{ background: skyBackground(sky, "canopy") }} aria-label="Sapaan harian">
        <SkyBackdrop sky={sky} variant="canopy" />
        <div className="home-greeting">
          <div className="min-w-0 py-2">
            <p className="break-words text-sm text-neutral-600 dark:text-neutral-300">{greeting}{data.userName ? `, ${data.userName}` : ""}.</p>
            <h1 className="mt-1 text-xl font-medium leading-tight sm:text-3xl">{hero.headline}</h1>
            <p className="mt-2 text-xs leading-relaxed text-neutral-600 dark:text-neutral-300">{hero.support}</p>
            {streak > 0 && <p className="mt-2 text-xs font-semibold text-brand-700 dark:text-brand-300">{streak} hari tercatat lengkap</p>}
          </div>
          <div className="home-mascot">
            <Mascot key={scene.mood} mood={scene.mood} className="home-mascot-art" decorative />
          </div>
        </div>
        <div className="home-scene-stage">
          {scenes.map(item => <div key={item.mood} className="home-scene-note" data-scene={item.mood} data-active={item.mood === scene.mood} aria-hidden={item.mood !== scene.mood}>
            <span className="home-scene-dot" aria-hidden="true" />
            <div><p className="home-scene-badge">{item.badge}</p><p className="home-scene-caption">{item.caption}</p></div>
          </div>)}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Link href="/makan" className="flex items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 py-3.5 font-semibold text-white transition-colors hover:bg-brand-700"><IconCamera className="h-5 w-5" />Catat makan</Link>
          <Link href="/makan?mode=cari" className="flex items-center justify-center gap-2 rounded-2xl border border-neutral-300/70 px-4 py-3 text-sm font-semibold dark:border-neutral-600"><IconSearch className="h-4 w-4" />Butuh ide makan?</Link>
        </div>
      </section>

      {notice && <p role="status" className="text-sm text-brand-700 dark:text-brand-300">{notice}</p>}
      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1.45fr)_minmax(260px,1fr)] lg:gap-6">
        <div className="min-w-0 space-y-5">
          <section className={card} aria-labelledby="intake-title">
            <div className="flex items-baseline justify-between gap-2"><h2 id="intake-title" className="text-sm font-semibold">Yang tercatat hari ini</h2><span className="text-xs text-neutral-500">{log.meals.length} catatan</span></div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <div><p className="text-xs text-neutral-500">Asupan</p><p className="mt-1 font-semibold tabular-nums">{caloriesLabel}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800" role="progressbar" aria-label="Asupan yang tercatat" aria-valuemin={0} aria-valuemax={Math.max(1, summary.target)} aria-valuenow={Math.min(Math.max(0, summary.caloriesIn), Math.max(1, summary.target))} aria-valuetext={caloriesLabel}><div className="h-full rounded-full bg-brand-500" style={{ width: `${intakePct}%` }} /></div></div>
              <div><p className="text-xs text-neutral-500">Protein</p><p className="mt-1 font-semibold tabular-nums">{proteinLabel}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800" role="progressbar" aria-label="Protein yang tercatat" aria-valuemin={0} aria-valuemax={Math.max(1, settings.proteinTargetG)} aria-valuenow={Math.min(Math.max(0, proteinToday), Math.max(1, settings.proteinTargetG))} aria-valuetext={proteinLabel}><div className="h-full rounded-full bg-brand-400" style={{ width: `${proteinPct}%` }} /></div></div>
            </div>
            {sugarToday.knownMeals > 0 && <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-neutral-100 pt-3 dark:border-neutral-800"><div><p className="text-xs text-neutral-500">Gula tambahan</p><p className="mt-1 font-semibold tabular-nums">{sugarToday.grams} g</p></div><p className="max-w-[65%] text-right text-xs text-neutral-500">{sugarNote(sugarToday, sugarWeek)}</p></div>}
            <p className="mt-3 text-xs text-neutral-500">Angka perkiraan dari catatanmu; kelengkapan catatan membantu melihat polanya.</p>
          </section>

          {evening && closeDay}

          <section aria-labelledby="recent-meals-title">
            <div className="mb-3 flex items-center justify-between gap-2"><h2 id="recent-meals-title" className="font-semibold">Catatan terbaru</h2><Link href="/makan#riwayat" className="text-xs font-semibold text-brand-700 underline-offset-2 hover:underline dark:text-brand-300">Lihat semua →</Link></div>
            {recent.length ? <div className="divide-y divide-neutral-200/70 rounded-2xl bg-white px-4 dark:divide-neutral-800 dark:bg-neutral-900">{recent.map(entry => <Link key={entry.id} href="/makan#riwayat" className="flex min-w-0 items-center gap-3 py-3.5"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"><IconBowl className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="break-words text-sm font-semibold">{entry.foodName}</p><p className="mt-0.5 text-xs text-neutral-500">{mealTime(entry.time, settings.timezone)}{entry.portionNote ? ` · ${entry.portionNote}` : ""}</p></div><span className="shrink-0 text-xs tabular-nums text-neutral-600 dark:text-neutral-300">{entry.calories} kcal</span></Link>)}</div> : <div className="rounded-2xl border border-dashed border-neutral-300 p-4 dark:border-neutral-700"><p className="text-sm text-neutral-500">Belum ada catatan hari ini. Makanan pertamamu bisa mulai dari foto atau tulisan.</p><Link href="/makan" className="mt-2 inline-flex text-sm font-semibold text-brand-700 dark:text-brand-300">Catat makan pertama →</Link></div>}
          </section>
          {fresh ? <GettingStarted hasMeal={log.meals.length > 0} closed={Boolean(log.foodLogComplete)} /> : <div className="home-coach"><DailyCoach coach={coach} moment={coachMoment} onMomentChange={setCoachMoment} /></div>}
          {!evening && closeDay}
        </div>

        <aside className="min-w-0 space-y-5" aria-label="Fokus dan progress">
          <ActivityCard burns={log.burns} date={data.date} weightKg={weightTrend.today ?? settings.weightKg} onChanged={load} />
          <WeeklyFocusCard />

          <section className={card} aria-labelledby="body-title">
            <h2 id="body-title" className="font-semibold">Tubuh &amp; progress</h2>
            <div className="mt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs text-neutral-500">Berat hari ini</p><p className="mt-1 font-display text-xl">{weightTrend.today !== null ? `${formatMeasure(weightTrend.today)} kg` : "Belum ditimbang"}</p></div><button type="button" onClick={() => setShowWeightForm(value => !value)} aria-expanded={showWeightForm} aria-controls="quick-weight-form" className="flex items-center gap-1.5 rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700"><IconScaleWeight className="h-4 w-4" />Catat berat</button></div>
              {showWeightForm && <form id="quick-weight-form" onSubmit={saveWeight} className="scroll-mb-24 space-y-2"><label className="block text-xs text-neutral-500" htmlFor="quick-weight">Berat badan (kg)</label><div className="flex gap-2"><input id="quick-weight" autoFocus value={weightInput} onChange={event => setWeightInput(event.target.value)} inputMode="decimal" placeholder="78,4" className="min-w-0 flex-1 rounded-xl border border-neutral-300 bg-transparent px-3 py-2 dark:border-neutral-700" /><button type="submit" disabled={savingWeight || !weightInput} className="rounded-xl bg-brand-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">{savingWeight ? "Menyimpan..." : "Simpan"}</button></div>{weightError && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{weightError}</p>}</form>}
              <div className="flex items-center justify-between gap-2 text-sm"><span className="text-neutral-500">Lingkar pinggang terakhir</span><span>{data.bodyResponse?.current.waist.last ? `${formatMeasure(data.bodyResponse.current.waist.last.value)} cm` : "Belum dicatat"}</span></div>
              <Link href="/progress?tab=body" className="inline-flex text-sm font-semibold text-brand-700 dark:text-brand-300">Lihat progress tubuh →</Link>
            </div>
          </section>

          <details className={card}>
            <summary className="cursor-pointer font-semibold">Pelengkap hari ini</summary>
            <div className="mt-4 space-y-5">
              <div><div className="flex items-start justify-between gap-3"><div className="flex items-start gap-2"><IconTarget className="mt-0.5 h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400" /><div><h3 className="text-sm font-semibold">Misi hari ini</h3><p className="mt-1 text-sm text-neutral-500">{challenge.label}</p></div></div><button type="button" role="checkbox" aria-checked={Boolean(log.challengeDone)} aria-label={log.challengeDone ? "Batalkan misi selesai" : "Tandai misi selesai"} onClick={toggleChallenge} disabled={savingChallenge} className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-lg disabled:opacity-50 ${log.challengeDone ? "border-brand-600 bg-brand-600 text-white" : "border-neutral-300 text-transparent dark:border-neutral-700"}`}>✓</button></div>{challengeError && <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-300">{challengeError}</p>}</div>
              <div className="grid gap-3 border-t border-neutral-200 pt-4 text-sm dark:border-neutral-800"><Link href="/plan" className="font-semibold text-brand-700 dark:text-brand-300">{log.plan ? "Lihat rencana harian" : "Atur rencana harian"} →</Link><Link href="/makan/habits">Makanan yang sering dicatat →</Link><Link href="/makan/restaurant">Ide saat makan di luar →</Link></div>
              {log.plan === "if" && log.eatingWindowHours && <p className="text-xs text-neutral-500">Rencana saat ini: jendela makan {log.eatingWindowHours} jam sejak bangun.</p>}
              {summary.caloriesIn > summary.target && <details><summary className="cursor-pointer text-sm text-neutral-500">Setelah makan lebih banyak dari rencana</summary><div className="mt-3"><RecoveryMode surplusKcal={Math.max(0, summary.caloriesIn - summary.target)} /></div></details>}
            </div>
          </details>
        </aside>
      </div>
    </div>
  );
}

function GettingStarted({ hasMeal, closed }: { hasMeal: boolean; closed: boolean }) {
  const steps = [
    { label: "Target awal sudah diatur", done: true },
    { label: "Catat makan pertamamu", done: hasMeal },
    { label: "Tutup hari setelah semua makan tercatat", done: closed },
  ];
  return <section className="rounded-2xl border border-neutral-200/70 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900" aria-labelledby="getting-started-title"><h2 id="getting-started-title" className="font-semibold">Mulai dari sini</h2><ul className="mt-3 space-y-3">{steps.map(step => <li key={step.label} className="flex items-center gap-3 text-sm"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs ${step.done ? "bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-200" : "border border-neutral-300 dark:border-neutral-700"}`} aria-hidden="true">{step.done ? "✓" : ""}</span><span>{step.label}<span className="sr-only">{step.done ? ", selesai" : ", belum selesai"}</span></span></li>)}</ul><p className="mt-3 text-xs leading-relaxed text-neutral-500">Saranmu berkembang dari catatan yang terkumpul. Untuk sekarang, satu catatan sudah jadi awal.</p></section>;
}
