"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { IconCamera, IconSparkle, IconBowl, IconBolt } from "@/components/icons";
import type { DayLog } from "@/lib/types";
import type { DaySummary } from "@/lib/day";
import AnalysisSheet, { type SheetPhase } from "@/components/AnalysisSheet";
import { compressImage, postPhoto, UploadAborted } from "@/lib/clientImage";
import type { FoodAnalysis } from "@/lib/gemini";
import { adjustMeal, hasOil, stapleOf, NO_ADJUST, STAPLE_STEP_G, CENTONG_G, type MealAdjust, type OilLevel, type EatenFraction } from "@/lib/mealMath";
import { emptyMealDraft, formatMealTime, hasMealDraft, mealDraftKey, mealDraftUserPrefix, mealTimeIso, priorMealDraft, readMealDraft, recentMealChoices, serializeMealDraft, type ManualMealDraft, type MealDraft, type RepeatMeal } from "@/lib/mealDraft";
import type { HabitStrategy } from "@/lib/habits";
import Mascot from "@/components/Mascot";

interface TodayData {
  userId: string;
  date: string;
  settings: { timezone: string };
  habits: HabitStrategy;
  log: DayLog;
  summary: DaySummary;
}

function MakanContent() {
  const searchParams = useSearchParams();
  const tab = searchParams.get("mode") === "cari" ? "cari" : "catat";
  const [today, setToday] = useState<TodayData | null>(null);
  const [loadError, setLoadError] = useState("");

  const reload = useCallback(async () => {
    try {
      const res = await fetch("/api/today");
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Catatan hari ini belum bisa dibuka.");
      setToday(d);
      setLoadError("");
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Catatan hari ini belum bisa dibuka.");
    }
  }, []);

  useEffect(() => {
    void reload();
    const refresh = () => void reload();
    window.addEventListener("focus", refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => { window.removeEventListener("focus", refresh); window.clearInterval(timer); };
  }, [reload]);

  return (
    <div className="space-y-4 p-4">
      <div><p className="text-xs font-semibold uppercase tracking-widest text-brand-600">Meja makan</p><h1 className="mt-1 text-2xl font-bold">Sedikit catatan, lebih paham.</h1><p className="mt-1 text-sm text-neutral-500">Foto, cek porsi, lalu simpan. Kukang temani pelan-pelan.</p></div>
      {loadError && <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><p>{loadError} {today ? "Ringkasan di bawah memakai data terakhir." : "Riwayat belum tersedia."}</p><button onClick={reload} className="mt-2 font-semibold underline">Coba muat lagi</button></div>}
      <TodayBar summary={today?.summary ?? null} />

      {today && <div hidden={tab !== "catat"}><CatatTab key={today.userId} today={today} onSaved={reload} /></div>}
      {!today && !loadError && <p role="status" className="p-4 text-sm text-neutral-500">Menyiapkan catatanmu…</p>}
      {tab === "cari" && <CariTab />}

      <MealHistory log={today?.log ?? null} timezone={today?.settings.timezone ?? "Asia/Jakarta"} onChanged={reload} />
    </div>
  );
}

export default function MakanPage() {
  return (
    <Suspense>
      <MakanContent />
    </Suspense>
  );
}

function TodayBar({ summary }: { summary: DaySummary | null }) {
  if (!summary) return null;
  const over = summary.caloriesIn > summary.target;
  const pct = Math.min(100, Math.max(0, (summary.caloriesIn / summary.target) * 100));
  return (
    <section className="rounded-2xl bg-linear-to-br from-brand-600 to-brand-800 p-4 text-white">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-brand-100">Hari ini</span>
        <span className="text-sm font-semibold tabular-nums">
          {over
            ? `${(summary.caloriesIn - summary.target).toLocaleString("id-ID")} kcal melebihi target`
            : `sisa ${(summary.target - summary.caloriesIn).toLocaleString("id-ID")} kcal`}
        </span>
      </div>
      <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/20">
        <div
          className={`h-full rounded-full transition-all duration-700 ${over ? "bg-amber-300" : "bg-white"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="mt-1.5 text-xs text-brand-100 tabular-nums">
        {summary.caloriesIn} / {summary.target} kcal
      </div>
    </section>
  );
}

// ---------- Catat makanan (foto → estimasi → simpan, atau tulis manual) ----------

interface QuickItem {
  name: string;
  kcal: number;
  protein: number;
  portion: string;
}

// Typical Indonesian portions. Review portion and time before saving.
const QUICK_ITEMS: QuickItem[] = [
  { name: "Teh manis", kcal: 110, protein: 0, portion: "1 gelas" },
  { name: "Es teh manis", kcal: 140, protein: 0, portion: "1 gelas besar" },
  { name: "Kopi susu", kcal: 180, protein: 3, portion: "1 gelas" },
  { name: "Minuman kemasan", kcal: 170, protein: 0, portion: "1 botol kecil" },
  { name: "Gorengan", kcal: 130, protein: 2, portion: "1 buah" },
  { name: "Kerupuk", kcal: 70, protein: 1, portion: "2-3 keping" },
  { name: "Roti + selai", kcal: 160, protein: 4, portion: "1 lembar" },
  { name: "Biskuit", kcal: 120, protein: 2, portion: "3-4 keping" },
  { name: "Tambah nasi", kcal: 130, protein: 3, portion: "1 centong" },
  { name: "Buah", kcal: 70, protein: 1, portion: "1 porsi" },
];

const CONFIDENCE_LABEL = { low: "rendah", medium: "sedang", high: "tinggi" } as const;

function nowHHMM(timezone?: string): string {
  const d = new Date();
  if (timezone) return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function MealTimeField({ value, onChange, timezone }: { value: string; onChange: (v: string) => void; timezone?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-neutral-500">Jam makan{timezone && <span className="block text-[10px]">{timezone}</span>}</span>
      <span className="flex items-center gap-2">
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 tabular-nums dark:border-neutral-700 dark:bg-neutral-800"
        />
        <button type="button" onClick={() => onChange(nowHHMM(timezone))} className="text-xs font-medium text-brand-600">
          Sekarang
        </button>
      </span>
    </label>
  );
}

async function postMeal(body: Record<string, unknown>): Promise<string | null> {
  const res = await fetch("/api/log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "meal", ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Belum tersimpan. Coba lagi ya.");
  return (data.entry?.id as string | undefined) ?? null;
}

function mealScrollBehavior(): ScrollBehavior {
  return document.documentElement.dataset.motion === "off" || window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
}
const photoDrafts = new Map<string, { file: File; preview: string; time: string }>();
const pendingMealSaves = new Map<string, string>();
type SaveNotice = { key: string; origin: string; saved?: string; id?: string | null; date?: string; error?: string };
function beginMealSave(key: string, origin: string): boolean {
  if (pendingMealSaves.has(key)) return false;
  pendingMealSaves.set(key, origin);
  window.dispatchEvent(new CustomEvent("slothly-meal-save", { detail: { key, origin } }));
  return true;
}
function finishMealSave(notice: SaveNotice) {
  pendingMealSaves.delete(notice.key);
  window.dispatchEvent(new CustomEvent("slothly-meal-save", { detail: notice }));
}
function persistMealDraft(key: string, next: MealDraft) {
  try {
    if (hasMealDraft(next)) sessionStorage.setItem(key, serializeMealDraft(next));
    else sessionStorage.removeItem(key);
  } catch { /* The in-memory form remains usable when browser storage is unavailable. */ }
}
function previousDraftFor(userId: string, date: string, time: string) {
  let previous = priorMealDraft(sessionStorage, userId, date);
  const prefix = mealDraftUserPrefix(userId);
  for (const key of photoDrafts.keys()) {
    if (!key.startsWith(prefix)) continue;
    const candidate = key.slice(prefix.length);
    if (candidate < date && (!previous || candidate > previous.date)) previous = { date: candidate, draft: readMealDraft(sessionStorage.getItem(key)) || emptyMealDraft(photoDrafts.get(key)?.time || time) };
  }
  return previous;
}

function CatatTab({ today, onSaved }: { today: TodayData; onSaved: () => void }) {
  const [draftDate, setDraftDate] = useState(today.date);
  const [allowPreviousDate, setAllowPreviousDate] = useState(false);
  const key = mealDraftKey(today.userId, draftDate);
  const keyRef = useRef(key);
  keyRef.current = key;
  const saveOrigin = useRef(crypto.randomUUID());
  const timezone = today.settings.timezone;
  const currentTime = () => nowHHMM(timezone);
  const [initial] = useState(() => {
    try { return readMealDraft(sessionStorage.getItem(key)) || emptyMealDraft(photoDrafts.get(key)?.time || currentTime()); }
    catch { return emptyMealDraft(currentTime()); }
  });
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(() => photoDrafts.get(key)?.preview || null);
  const [sheet, setSheet] = useState<SheetPhase | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [photoError, setPhotoError] = useState("");
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const lastFile = useRef<File | null>(photoDrafts.get(key)?.file || null);
  const resultRef = useRef<HTMLElement>(null);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FoodAnalysis | null>(initial.result);
  const [name, setName] = useState(initial.name);
  const [adj, setAdj] = useState<MealAdjust>(initial.adjust);
  const [kcalEdit, setKcalEdit] = useState<string | null>(initial.kcalEdit);
  const [mealTime, setMealTime] = useState(initial.time);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState("");
  const [undoId, setUndoId] = useState<string | null>(null);
  const [manualOpen, setManualOpen] = useState(initial.manualOpen);
  const [manual, setManual] = useState<ManualMealDraft>(initial.manual);
  const [restored, setRestored] = useState(hasMealDraft(initial) || photoDrafts.has(key));
  const [quick, setQuick] = useState<RepeatMeal | null>(initial.quick);
  const [quickPortion, setQuickPortion] = useState(initial.quickPortion);
  const [quickTime, setQuickTime] = useState(initial.quickTime);
  const [undoing, setUndoing] = useState(false);
  const [undoDate, setUndoDate] = useState(today.date);
  const [pending, setPending] = useState(pendingMealSaves.has(key));
  const [previous, setPrevious] = useState<{ date: string; draft: MealDraft } | null>(() => {
    try { return previousDraftFor(today.userId, today.date, currentTime()); } catch { return null; }
  });
  const draft: MealDraft = { result, name, adjust: adj, kcalEdit, time: mealTime, manualOpen, manual, quick, quickPortion, quickTime };
  const dirty = hasMealDraft(draft) || Boolean(preview);
  const busy = saving || pending;
  const rollover = draftDate !== today.date;
  const reviewPrevious = rollover && !allowPreviousDate;
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const mounted = useRef(true);
  const analysisRun = useRef(0);
  const [celebrating, setCelebrating] = useState(false);

  useEffect(() => {
    if (!saved) return;
    setCelebrating(true);
    const timer = window.setTimeout(() => setCelebrating(false), 1800);
    return () => window.clearTimeout(timer);
  }, [saved]);

  function persist(next: MealDraft) {
    draftRef.current = next;
    persistMealDraft(key, next);
  }

  function switchDraft(date: string, next: MealDraft, reviewed = false) {
    analysisRun.current++;
    xhrRef.current?.abort();
    const nextKey = mealDraftKey(today.userId, date);
    keyRef.current = nextKey;
    draftRef.current = next;
    setDraftDate(date); setAllowPreviousDate(reviewed);
    setResult(next.result); setName(next.name); setAdj(next.adjust); setKcalEdit(next.kcalEdit);
    setMealTime(next.time); setManual(next.manual); setManualOpen(next.manualOpen);
    setQuick(next.quick); setQuickPortion(next.quickPortion); setQuickTime(next.quickTime);
    setPreview(photoDrafts.get(nextKey)?.preview || null);
    lastFile.current = photoDrafts.get(nextKey)?.file || null;
    setSheet(null); setRestored(hasMealDraft(next)); setError("");
    setPending(pendingMealSaves.has(nextKey));
  }

  useEffect(() => {
    if (rollover && !dirty && !pendingMealSaves.has(key)) switchDraft(today.date, emptyMealDraft(currentTime()));
  }, [today.date, draftDate, dirty, pending]);

  useEffect(() => {
    const receive = (event: Event) => {
      const notice = (event as CustomEvent<SaveNotice>).detail;
      if (notice.key !== key) {
        if (notice.key.startsWith(mealDraftUserPrefix(today.userId)) && !pendingMealSaves.has(notice.key)) {
          // An earlier-day request may finish while today's empty form is open.
          // Remove any recovery offer for the now-saved snapshot.
          try { setPrevious(previousDraftFor(today.userId, today.date, currentTime())); } catch { setPrevious(null); }
          if (notice.saved) { setSaved(notice.saved); setUndoId(notice.id || null); setUndoDate(notice.date || draftDate); onSaved(); }
        }
        return;
      }
      setPending(pendingMealSaves.has(key));
      if (pendingMealSaves.has(key) || notice.origin === saveOrigin.current) return;
      // A request begun on the previous route settled. Its fields were locked,
      // so restoring the persisted remainder cannot discard newer edits.
      let remaining = emptyMealDraft(currentTime());
      try { remaining = readMealDraft(sessionStorage.getItem(key)) || remaining; } catch { /* Browser storage may be blocked. */ }
      switchDraft(draftDate, remaining, allowPreviousDate);
      if (notice.saved) { setSaved(notice.saved); setUndoId(notice.id || null); setUndoDate(notice.date || draftDate); onSaved(); }
      if (notice.error) setError(notice.error);
    };
    window.addEventListener("slothly-meal-save", receive);
    return () => window.removeEventListener("slothly-meal-save", receive);
  }, [key, draftDate, allowPreviousDate]);

  useEffect(() => {
    persist(draft);
  }, [key, result, name, adj, kcalEdit, mealTime, manualOpen, manual, quick, quickPortion, quickTime]);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; analysisRun.current++; xhrRef.current?.abort(); persistMealDraft(keyRef.current, draftRef.current); };
  }, []);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const repeatMeals = recentMealChoices(today.log.meals, today.habits?.recurringMeals || []);

  function discard() {
    if (dirty && !window.confirm("Buang draft makanan ini? Catatan yang sudah tersimpan tetap aman.")) return;
    reset();
    setManual(emptyMealDraft(currentTime()).manual);
    setManualOpen(false);
    setName("");
    setRestored(false);
    setQuick(null);
    persist(emptyMealDraft(currentTime()));
    if (rollover) switchDraft(today.date, emptyMealDraft(currentTime()));
    try { setPrevious(previousDraftFor(today.userId, today.date, currentTime())); } catch { setPrevious(null); }
  }

  useEffect(() => {
    if (sheet !== "upload" && sheet !== "read") return;
    const id = setInterval(() => setSeconds((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [sheet]);

  async function handleFile(file: File) {
    const run = ++analysisRun.current;
    xhrRef.current?.abort();
    lastFile.current = file;
    setError("");
    setPhotoError("");
    setResult(null);
    setSaved("");
    setUndoId(null);
    setAdj(NO_ADJUST);
    setKcalEdit(null);
    setManualOpen(false);
    setSeconds(0);
    const old = photoDrafts.get(key);
    const capturedTime = old?.file === file ? old.time : rollover ? mealTime : currentTime();
    if (old) URL.revokeObjectURL(old.preview);
    const photoPreview = URL.createObjectURL(file);
    photoDrafts.set(key, { file, preview: photoPreview, time: capturedTime });
    setPreview(photoPreview);
    setSheet("upload");
    try {
      const photo = await compressImage(file);
      if (!mounted.current || run !== analysisRun.current) return;
      // Some networks never report upload progress; don't leave step 1 spinning.
      const nudge = setTimeout(() => setSheet((p) => (p === "upload" ? "read" : p)), 2500);
      const { status, data } = await postPhoto(photo, {
        onUploaded: () => setSheet("read"),
        register: (xhr) => {
          xhrRef.current = xhr;
        },
      });
      clearTimeout(nudge);
      if (status < 200 || status >= 300 || !data?.analysis) {
        throw new Error(data?.error || "Foto belum bisa dibaca. Coba lagi atau isi manual.");
      }
      const analysis = data.analysis as FoodAnalysis;
      if (!mounted.current || run !== analysisRun.current) return;
      setResult(analysis);
      setName(analysis.foodName);
      setMealTime(capturedTime);
      setSheet("done");
      await new Promise((resolve) => setTimeout(resolve, 450));
      if (!mounted.current || run !== analysisRun.current) return;
      setSheet(null);
      // Bring the result card (with its Save button) into view.
      setTimeout(() => resultRef.current?.scrollIntoView({ behavior: mealScrollBehavior(), block: "start" }), 80);
    } catch (e) {
      if (e instanceof UploadAborted || !mounted.current || run !== analysisRun.current) return;
      setPhotoError(e instanceof Error ? e.message : "Foto belum bisa dibaca.");
      setSheet("error");
    }
  }

  function cancelAnalysis() {
    analysisRun.current++;
    xhrRef.current?.abort();
    setSheet(null);
    // Dismiss/cancel keeps the selected photo available for retry.
  }

  function reset() {
    persist({ ...draftRef.current, result: null, name: "", adjust: NO_ADJUST, kcalEdit: null });
    setResult(null);
    setPreview(null);
    setAdj(NO_ADJUST);
    setKcalEdit(null);
    setError("");
    setName("");
    const photo = photoDrafts.get(key);
    if (photo) URL.revokeObjectURL(photo.preview);
    photoDrafts.delete(key);
    lastFile.current = null;
  }

  async function quickAdd(item: QuickItem) {
    setQuick({ key: item.name, name: item.name, kcal: item.kcal, protein: item.protein, carbs: 0, fat: 0, portion: item.portion, detail: "Perkiraan umum; karbo dan lemak belum tersedia" });
    setQuickPortion("1");
    setQuickTime(currentTime());
  }

  async function saveQuick() {
    if (!quick || busy || reviewPrevious) return;
    const multiplier = Number(quickPortion);
    const time = mealTimeIso(quickTime, draftDate, timezone, new Date(), allowPreviousDate);
    if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 10 || !time) {
      setError(`Cek porsi (lebih dari 0, maksimal 10) dan jam makan pada ${draftDate}. Catatan harus sudah terjadi, maksimal 36 jam yang lalu.`);
      return;
    }
    if (!beginMealSave(key, saveOrigin.current)) return;
    const notice: SaveNotice = { key, origin: saveOrigin.current, date: draftDate };
    setError("");
    setSaving(true);
    try {
      const id = await postMeal({
        date: draftDate, time,
        foodName: quick.name,
        calories: Math.round(quick.kcal * multiplier),
        protein_g: Math.round(quick.protein * multiplier),
        carbs_g: Math.round(quick.carbs * multiplier),
        fat_g: Math.round(quick.fat * multiplier),
        portionNote: `${multiplier} × ${quick.portion} · ${quick.detail}`,
        source: "manual",
      });
      notice.saved = `${quick.name} · ${Math.round(quick.kcal * multiplier)} kcal`;
      notice.id = id;
      setSaved(notice.saved);
      setUndoId(id);
      setUndoDate(draftDate);
      setQuick(null);
      persist({ ...draftRef.current, quick: null });
      onSaved();
    } catch (e) {
      notice.error = e instanceof Error ? e.message : "Belum tersimpan. Coba lagi ya.";
      setError(notice.error);
    } finally { setSaving(false); finishMealSave(notice); }
  }

  async function undoLast() {
    if (!undoId || undoing) return;
    setUndoing(true);
    setError("");
    try {
      const res = await fetch(`/api/log?type=meal&id=${encodeURIComponent(undoId)}&date=${undoDate}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Belum berhasil dibatalkan. Catatan masih tersimpan; coba Batalkan lagi.");
      setUndoId(null);
      setSaved("");
      onSaved();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal membatalkan. Coba lagi."); }
    finally { setUndoing(false); }
  }

  async function saveMeal() {
    if (!result || busy || reviewPrevious) return;
    const meal = adjustMeal(result, adj);
    const kcal = kcalEdit !== null ? Number(kcalEdit) : meal.calories;
    if (!Number.isFinite(kcal) || kcal <= 0) {
      setError("Isi kalorinya dulu, harus lebih dari 0.");
      return;
    }
    const time = mealTimeIso(mealTime, draftDate, timezone, new Date(), allowPreviousDate);
    if (!time) {
      setError(`Pilih jam yang sudah terjadi pada ${draftDate}, maksimal 36 jam yang lalu.`);
      return;
    }
    if (!beginMealSave(key, saveOrigin.current)) return;
    const notice: SaveNotice = { key, origin: saveOrigin.current, date: draftDate };
    setError("");
    setSaving(true);
    try {
      const id = await postMeal({
        date: draftDate,
        time,
        foodName: name.trim() || result.foodName,
        calories: Math.round(kcal),
        protein_g: meal.protein_g,
        carbs_g: meal.carbs_g,
        fat_g: meal.fat_g,
        portionNote: `${result.portionNote}${stapleOf(result) ? ` · ${stapleOf(result)?.name} ${meal.stapleGrams} g di piring` : ""}${hasOil(result) ? ` · minyak/saus ${{ less: "sedikit", normal: "biasa", more: "banyak" }[adj.oil]}` : ""} · dimakan ${adj.eaten * 100}%${kcalEdit !== null ? " · kalori dikoreksi manual; makro tetap estimasi porsi" : ""}`,
        source: "photo",
      });
      notice.saved = `${name.trim() || result.foodName} · ${Math.round(kcal)} kcal`;
      notice.id = id;
      setSaved(notice.saved);
      setUndoId(id);
      setUndoDate(draftDate);
      reset();
      setRestored(false);
      onSaved();
    } catch (e) {
      notice.error = e instanceof Error ? e.message : "Gagal menyimpan.";
      setError(notice.error);
    } finally {
      setSaving(false);
      finishMealSave(notice);
    }
  }

  const meal = result ? adjustMeal(result, adj) : null;
  const kcalShown = meal ? (kcalEdit ?? String(meal.calories)) : "";
  const staple = result ? stapleOf(result) : undefined;

  function change(next: Partial<MealAdjust>) {
    setAdj((current) => ({ ...current, ...next }));
    setKcalEdit(null);
  }

  return (
    <div className="space-y-4">
      {rollover && <section role="status" className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><p>Draft untuk <strong>{draftDate}</strong> masih ada. Hari ini sudah {today.date}. Draft ini tetap memakai tanggal asalnya.</p>{allowPreviousDate ? <p className="text-xs">Kamu memilih melanjutkan tanggal {draftDate}. Cek jam makan sebelum menyimpan; catatan maksimal 36 jam yang lalu.</p> : <button type="button" disabled={busy} onClick={() => setAllowPreviousDate(true)} className="font-semibold underline">Lanjutkan draft {draftDate}</button>}<button type="button" disabled={busy} onClick={discard} className="block font-semibold underline">Buang dan mulai hari ini</button></section>}
      {!rollover && previous && <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><p>Masih ada draft dari {previous.date}. Tanggalnya tidak akan dipindah ke hari ini.</p><button type="button" disabled={busy || dirty} onClick={() => { switchDraft(previous.date, previous.draft, true); setPrevious(null); }} className="font-semibold underline disabled:opacity-50">Lanjutkan draft {previous.date}</button>{dirty && <p className="text-xs">Selesaikan atau buang draft hari ini sebelum membuka draft sebelumnya.</p>}</section>}
      {busy && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-950/30 dark:text-brand-200">Sedang memastikan catatan tersimpan. Draft dikunci sebentar agar perubahanmu tetap aman.</p>}
      <fieldset disabled={busy || reviewPrevious} className="min-w-0 space-y-4">
      {dirty && !rollover && <div className="flex items-center justify-between gap-3 rounded-2xl border border-brand-200 bg-brand-50 px-4 py-3 text-xs text-brand-800 dark:border-brand-900 dark:bg-brand-950/30 dark:text-brand-200"><p>{restored ? "Draft-mu kembali." : "Draft disimpan selama sesi ini."} Kamu bisa pindah halaman lalu lanjut. Foto hanya di memori tab ini.</p><button type="button" onClick={discard} disabled={busy} className="shrink-0 font-semibold underline">Buang draft</button></div>}
      {(["environment", undefined] as const).map((capture) => (
        <input
          key={capture ?? "gallery"}
          ref={capture ? cameraRef : galleryRef}
          type="file"
          accept="image/*"
          capture={capture}
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) handleFile(f);
          }}
        />
      ))}

      {saved && (
        <p role="status" className="rounded-xl bg-brand-50 px-4 py-2 text-center text-sm text-brand-700 dark:bg-brand-950/30 dark:text-brand-300">
          <Mascot mood={celebrating ? "cheer" : "happy"} className="mx-auto mb-1 h-14 w-14" />
          Tersimpan: {saved} ✓
          {undoId && (
            <button type="button" onClick={undoLast} disabled={undoing} className="ml-2 font-semibold underline underline-offset-2 disabled:opacity-50">
              {undoing ? "Membatalkan…" : "Batalkan"}
            </button>
          )}
        </p>
      )}

      {!preview && !result && (
        <section className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div><h2 className="font-semibold">Apa yang kamu makan?</h2><p className="mt-1 text-xs text-neutral-500">Mulai dari foto atau isi sendiri, lalu cek sebelum menyimpan.</p></div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => cameraRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-2xl bg-brand-600 px-3 py-5 text-white"
            >
              <IconCamera className="h-6 w-6" />
              <span className="text-sm font-semibold">Foto sekarang</span>
            </button>
            <button
              onClick={() => galleryRef.current?.click()}
              className="flex flex-col items-center gap-1.5 rounded-2xl border border-brand-300 px-3 py-5 text-brand-700 dark:border-brand-800 dark:text-brand-300"
            >
              <IconBowl className="h-6 w-6" />
              <span className="text-sm font-semibold">Dari galeri</span>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setManualOpen((v) => !v)}
              className="rounded-xl border border-neutral-200 py-2.5 text-sm font-medium dark:border-neutral-700"
            >
              {manualOpen ? "Sembunyikan form" : "Tulis manual"}
            </button>
            <Link
              href="/makan/habits"
              aria-disabled={busy || reviewPrevious}
              onClick={(event) => { if (busy || reviewPrevious) event.preventDefault(); }}
              className="rounded-xl border border-neutral-200 py-2.5 text-center text-sm font-medium dark:border-neutral-700"
            >
              Yang sering →
            </Link>
          </div>
          <details>
            <summary className="cursor-pointer text-xs font-medium text-neutral-500">Cemilan &amp; minuman (perkiraan umum)</summary>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ITEMS.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  onClick={() => quickAdd(item)}
                  className="rounded-full border border-neutral-200 px-3 py-1.5 text-sm active:scale-95 dark:border-neutral-700"
                >
                  {item.name} <span className="text-xs text-neutral-400">{item.kcal}</span>
                </button>
              ))}
            </div>
          </details>
        </section>
      )}

      {!preview && !result && repeatMeals.length > 0 && <section className="space-y-2"><div className="flex items-center justify-between px-1"><h2 className="text-sm font-semibold">Makan yang sama lagi?</h2><Link href="/makan/habits" className="text-xs text-brand-700">Lihat pola →</Link></div><p className="px-1 text-xs text-neutral-500">Dari catatanmu sendiri. Cek porsi dan jam sebelum menambah.</p><div className="grid gap-2">{repeatMeals.map((item) => <button type="button" key={item.key} onClick={() => { setQuick(item); setQuickPortion("1"); setQuickTime(currentTime()); }} className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-100 bg-white p-3.5 text-left shadow-xs dark:border-neutral-800 dark:bg-neutral-900"><span className="min-w-0"><strong className="block truncate text-sm">{item.name}</strong><span className="text-xs text-neutral-500">{item.detail}</span></span><span className="shrink-0 text-sm font-semibold text-brand-700">{item.kcal} kcal +</span></button>)}</div></section>}

      {preview && !result && !sheet && <section className="space-y-3 rounded-2xl border border-brand-200 bg-white p-4 dark:border-brand-900 dark:bg-neutral-900"><p className="text-sm">Fotomu masih di sini. Lanjutkan membaca atau isi makanan secara manual.</p><div className="flex gap-2"><button type="button" onClick={() => lastFile.current && handleFile(lastFile.current)} className="flex-1 rounded-xl bg-brand-600 px-3 py-2.5 text-sm font-semibold text-white">Baca foto lagi</button><button type="button" onClick={() => setManualOpen(true)} className="rounded-xl border border-neutral-200 px-3 py-2.5 text-sm">Isi manual</button></div></section>}

      {quick && <section role="dialog" aria-label="Cek makanan berulang" className="space-y-3 rounded-2xl border-2 border-brand-200 bg-white p-4 shadow-xs dark:border-brand-800 dark:bg-neutral-900"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">{quick.name}</h2><p className="mt-1 text-xs text-neutral-500">{quick.portion} · {quick.detail}</p></div><button type="button" onClick={() => setQuick(null)} disabled={saving} aria-label="Tutup pilihan makanan" className="p-1">✕</button></div><label className="flex items-center justify-between gap-3 text-sm">Jumlah porsi<input aria-label="Jumlah porsi" type="number" min="0.25" max="10" step="0.25" value={quickPortion} onChange={(e) => setQuickPortion(e.target.value)} className="w-24 rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800" /></label><p className="text-sm font-semibold tabular-nums">≈ {Math.round(quick.kcal * (Number(quickPortion) || 0))} kcal · {Math.round(quick.protein * (Number(quickPortion) || 0))} g protein</p><MealTimeField value={quickTime} onChange={setQuickTime} timezone={timezone} /><button type="button" onClick={saveQuick} disabled={saving} className="w-full rounded-xl bg-brand-600 py-3 font-semibold text-white disabled:opacity-50">{saving ? "Menyimpan…" : rollover ? `Tambahkan ke ${draftDate}` : "Tambahkan ke hari ini"}</button></section>}

      {manualOpen && (
        <ManualForm
          draft={manual}
          onChange={setManual}
          date={draftDate}
          timezone={timezone}
          lockKey={key}
          saveOrigin={saveOrigin.current}
          busy={busy || reviewPrevious}
          allowPreviousDate={allowPreviousDate}
          onSaved={(label, id) => {
            persist({ ...draftRef.current, manual: emptyMealDraft(currentTime()).manual, manualOpen: false });
            setSaved(label);
            setUndoId(id);
            setUndoDate(draftDate);
            setManual(emptyMealDraft(currentTime()).manual);
            setManualOpen(false);
            onSaved();
          }}
        />
      )}

      {sheet && (
        <AnalysisSheet
          phase={sheet}
          seconds={seconds}
          preview={preview}
          error={photoError}
          onCancel={cancelAnalysis}
          onRetry={() => lastFile.current && handleFile(lastFile.current)}
          onManual={() => {
            setSheet(null);
            setManualOpen(true);
          }}
        />
      )}
      {error && (
        <p role="alert" className="text-center text-sm text-red-500">
          {error}
        </p>
      )}

      {result && (
        <section ref={resultRef} className="scroll-mt-4 space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex gap-3">
            {preview && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Foto makanan" className="h-20 w-20 shrink-0 rounded-xl object-cover" />
            )}
            <div className="min-w-0 flex-1">
              <label className="mb-1 block text-xs text-neutral-500" htmlFor="meal-name">Nama makanan</label>
              <textarea
                id="meal-name"
                rows={name.length > 40 ? 3 : 2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full resize-none rounded-lg border border-neutral-300 px-3 py-2 text-[15px] font-semibold leading-snug dark:border-neutral-700 dark:bg-neutral-800"
              />
            </div>
          </div>
          <div>
            <div className="text-xs text-neutral-500">
              {result.portionNote} · keyakinan {CONFIDENCE_LABEL[result.confidence]}
            </div>
            {result.confidence === "low" && (
              <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                Tebakannya masih kasar. Cek nama dan kalorinya dulu sebelum disimpan.
              </p>
            )}
          </div>

          <div className="grid grid-cols-4 items-end gap-2 text-center text-sm">
            <div>
              <input
                inputMode="numeric"
                value={kcalShown}
                onChange={(e) => setKcalEdit(e.target.value.replace(/\D/g, ""))}
                aria-label="Kalori"
                className="w-full rounded-lg border border-neutral-300 px-1 py-1.5 text-center font-semibold dark:border-neutral-700 dark:bg-neutral-800"
              />
              <div className="mt-0.5 text-xs text-neutral-500">kcal</div>
            </div>
            <div>
              <div className="font-semibold">{meal?.protein_g ?? 0}g</div>
              <div className="text-xs text-neutral-500">protein</div>
            </div>
            <div>
              <div className="font-semibold">{meal?.carbs_g ?? 0}g</div>
              <div className="text-xs text-neutral-500">karbo</div>
            </div>
            <div>
              <div className="font-semibold">{meal?.fat_g ?? 0}g</div>
              <div className="text-xs text-neutral-500">lemak</div>
            </div>
          </div>

          {kcalEdit !== null && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-950/30 dark:text-amber-200">Kalori memakai angka yang kamu isi. Makro dan rincian di bawah tetap estimasi porsi, bukan perhitungan ulang dari kalori ini. <button type="button" onClick={() => setKcalEdit(null)} className="font-semibold underline">Kembali ke estimasi porsi</button></p>}
          {meal && kcalEdit === null && (
            <p className="text-xs text-neutral-500">
              Perkiraan kasar, bisa sekitar {meal.low}–{meal.high} kcal. Koreksi di bawah kalau porsimu beda.
            </p>
          )}

          {meal && result.components.length > 0 && (
            <ul className="space-y-1 rounded-xl bg-neutral-50 p-3 text-xs dark:bg-neutral-800/60">
              <li className="pb-1 font-semibold text-neutral-500">{kcalEdit !== null ? "Rincian estimasi porsi (sebelum koreksi kalori manual)" : "Rincian yang kamu makan"}</li>
              {meal.components.map((c, i) => (
                <li key={i} className="flex justify-between gap-3">
                  <span className="min-w-0 truncate text-neutral-600 dark:text-neutral-300">
                    {c.name}
                    {c.grams > 0 && <span className="text-neutral-400"> · ±{c.grams} g</span>}
                  </span>
                  <span className="shrink-0 tabular-nums text-neutral-500">{c.calories} kcal</span>
                </li>
              ))}
            </ul>
          )}

          {staple && (
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-neutral-500">
                {staple.name} di piring ≈ {(Math.max(0, staple.grams + adj.stapleDeltaG) / CENTONG_G).toLocaleString("id-ID", { maximumFractionDigits: 1 })} centong
              </span>
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label={`Kurangi ${staple.name}`}
                  disabled={staple.grams + adj.stapleDeltaG - STAPLE_STEP_G < 0}
                  onClick={() => change({ stapleDeltaG: adj.stapleDeltaG - STAPLE_STEP_G })}
                  className="h-9 w-9 rounded-lg border border-neutral-300 text-lg disabled:opacity-30 dark:border-neutral-700"
                >
                  −
                </button>
                <button
                  type="button"
                  aria-label={`Tambah ${staple.name}`}
                  disabled={staple.grams + adj.stapleDeltaG + STAPLE_STEP_G > 800}
                  onClick={() => change({ stapleDeltaG: adj.stapleDeltaG + STAPLE_STEP_G })}
                  className="h-9 w-9 rounded-lg border border-neutral-300 text-lg disabled:opacity-30 dark:border-neutral-700"
                >
                  +
                </button>
              </span>
            </div>
          )}

          {hasOil(result) && (
            <Segmented<OilLevel>
              label="Minyak / saus"
              value={adj.oil}
              onChange={(oil) => change({ oil })}
              options={[["less", "Sedikit"], ["normal", "Biasa"], ["more", "Banyak"]]}
            />
          )}

          <Segmented<`${EatenFraction}`>
            label="Yang kamu makan"
            value={`${adj.eaten}`}
            onChange={(v) => change({ eaten: Number(v) as EatenFraction })}
            options={[["1", "Habis"], ["0.75", "¾"], ["0.5", "½"], ["0.25", "¼"]]}
          />

          <MealTimeField value={mealTime} onChange={setMealTime} timezone={timezone} />

          <div className="flex gap-2">
            <button
              onClick={discard}
              disabled={saving}
              className="rounded-xl border border-neutral-300 px-4 py-3 text-sm font-medium dark:border-neutral-700"
            >
              Buang draft
            </button>
            <button
              onClick={saveMeal}
              disabled={saving}
              className="flex-1 rounded-xl bg-brand-600 py-3 font-medium text-white disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : rollover ? `Simpan ke tanggal ${draftDate}` : "Simpan ke catatan hari ini"}
            </button>
          </div>
        </section>
      )}
      </fieldset>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<[T, string]>;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-neutral-500">{label}</span>
      <div className="flex gap-1 rounded-xl bg-neutral-100 p-1 dark:bg-neutral-800" role="radiogroup" aria-label={label}>
        {options.map(([optionValue, text]) => (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={value === optionValue}
            onClick={() => onChange(optionValue)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              value === optionValue ? "bg-white text-brand-700 shadow-xs dark:bg-neutral-700 dark:text-brand-300" : "text-neutral-500"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function ManualForm({ draft, onChange, onSaved, date, timezone, lockKey, saveOrigin, busy, allowPreviousDate }: { draft: ManualMealDraft; onChange: (draft: ManualMealDraft) => void; onSaved: (label: string, id: string | null) => void; date: string; timezone: string; lockKey: string; saveOrigin: string; busy: boolean; allowPreviousDate: boolean }) {
  const { name, kcal, protein, time: mealTime } = draft;
  const change = (next: Partial<ManualMealDraft>) => onChange({ ...draft, ...next });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    const calories = Number(kcal);
    if (!name.trim() || !Number.isFinite(calories) || calories <= 0) {
      setError("Isi nama makanan dan kalorinya dulu ya.");
      return;
    }
    const time = mealTimeIso(mealTime, date, timezone, new Date(), allowPreviousDate);
    if (!time) {
      setError(`Pilih jam yang sudah terjadi pada ${date}, maksimal 36 jam yang lalu.`);
      return;
    }
    if (!beginMealSave(lockKey, saveOrigin)) return;
    const notice: SaveNotice = { key: lockKey, origin: saveOrigin, date };
    setSaving(true);
    setError("");
    try {
      const id = await postMeal({
        date,
        time,
        foodName: name.trim(),
        calories,
        protein_g: Number(protein) || 0,
        source: "manual",
      });
      notice.saved = `${name.trim()} · ${Math.round(calories)} kcal`;
      notice.id = id;
      onSaved(notice.saved, id);
    } catch (err) {
      notice.error = err instanceof Error ? err.message : "Gagal menyimpan.";
      setError(notice.error);
    } finally {
      setSaving(false);
      finishMealSave(notice);
    }
  }

  const input = "w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800";
  return (
    <form onSubmit={submit} className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
      <h2 className="font-semibold">Tulis makananmu</h2>
      <label className="block text-xs text-neutral-500">Nama makanan<input autoFocus value={name} onChange={(e) => change({ name: e.target.value })} placeholder="Mis. nasi goreng" className={`${input} mt-1`} /></label>
      <div className="grid grid-cols-2 gap-2">
        <label className="text-xs text-neutral-500">Kalori (kcal)<input value={kcal} onChange={(e) => change({ kcal: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="Wajib" className={`${input} mt-1`} /></label>
        <label className="text-xs text-neutral-500">Protein (g)<input value={protein} onChange={(e) => change({ protein: e.target.value.replace(/\D/g, "") })} inputMode="numeric" placeholder="Opsional" className={`${input} mt-1`} /></label>
      </div>
      <p className="text-xs text-neutral-500">Makro yang belum kamu isi belum tersedia. Catatan ini tetap perkiraan.</p>
      <MealTimeField value={mealTime} onChange={(time) => change({ time })} timezone={timezone} />
      {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
      <button type="submit" disabled={saving} className="w-full rounded-xl bg-brand-600 py-3 font-medium text-white disabled:opacity-50">
        {saving ? "Menyimpan..." : "Simpan"}
      </button>
    </form>
  );
}

// ---------- Cari makan (satiety / hunger-mode recommendation) ----------

const INTENTS = [
  ["hungry", "😩 Lapar"], ["sweet", "🍫 Manis"], ["savory", "🧂 Gurih"],
  ["crispy", "🍿 Renyah"], ["comfort", "🍲 Comfort"], ["quick", "⚡ Cepat"],
] as const;
const OBJECTIVES = [
  ["high_volume", "Volume besar"], ["high_protein", "Protein tinggi"],
  ["high_fiber", "Serat tinggi"], ["low_calorie", "Kalori tipis"], ["vegetarian", "Vegetarian"],
] as const;

type SatietyResult = {
  input: { remainingCalories: number; remainingProteinG: number };
  strategy: {
    mealCalorieBudget: number; proteinTargetG: number; message: string; dataNote: string;
    recommendations: Array<{ id: string; name: string; serving: string; calories: number; proteinG: number; fiberG: number; fullnessScore: number; why: string }>;
  };
  ai?: { summary: string; suggestions: string[]; source: "ai" | "template" } | null;
  aiError?: string;
};

function CariTab() {
  const [intent, setIntent] = useState("hungry");
  const [objectives, setObjectives] = useState<string[]>(["high_volume", "high_protein"]);
  const [pantry, setPantry] = useState("");
  const [result, setResult] = useState<SatietyResult | null>(null);
  const [loading, setLoading] = useState(false);

  function toggleObjective(value: string) {
    setObjectives((current) => (current.includes(value) ? current.filter((x) => x !== value) : [...current, value]));
  }

  async function run(withAi = false) {
    setLoading(true);
    try {
      const res = await fetch("/api/satiety", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ intent, objectives, pantry, withAi }),
      });
      setResult(await res.json());
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <section className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
        <div className="text-sm font-medium">Aku sedang mencari...</div>
        <div className="grid grid-cols-3 gap-2">
          {INTENTS.map(([value, label]) => (
            <button
              key={value}
              onClick={() => setIntent(value)}
              className={`rounded-xl border px-2 py-2 text-sm ${intent === value ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950/30" : "border-neutral-200 dark:border-neutral-700"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          {OBJECTIVES.map(([value, label]) => (
            <button
              key={value}
              onClick={() => toggleObjective(value)}
              className={`rounded-full px-3 py-1.5 text-xs ${objectives.includes(value) ? "bg-brand-600 text-white" : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-300"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <textarea
          value={pantry}
          onChange={(e) => setPantry(e.target.value)}
          placeholder="Bahan yang ada, misalnya: timun, telur, yogurt, ayam"
          className="min-h-20 w-full rounded-xl border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
        />
        <button onClick={() => run(false)} disabled={loading} className="w-full rounded-xl bg-brand-600 py-3 font-medium text-white disabled:opacity-50">
          {loading ? "Mencari..." : "Cari yang paling bikin kenyang"}
        </button>
      </section>

      {result?.strategy && (
        <>
          <section className="rounded-2xl bg-brand-50 p-4 dark:bg-brand-950/30">
            <div className="text-sm font-medium">Ide buat makan berikutnya</div>
            <div className="mt-1 text-sm">Sisa {result.input.remainingCalories} kcal · sisa protein {result.input.remainingProteinG} g</div>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-300">{result.strategy.message}</p>
          </section>

          <section className="space-y-3">
            {result.strategy.recommendations.map((food) => (
              <article key={food.id} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-medium">{food.name}</div>
                    <div className="text-xs text-neutral-500">{food.serving}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">{food.calories} kcal</div>
                    <div className="text-xs text-neutral-400">{food.proteinG} g protein</div>
                  </div>
                </div>
                <div className="mt-2 text-sm">Kenyangnya {"★".repeat(food.fullnessScore)}{"☆".repeat(5 - food.fullnessScore)}</div>
                <p className="mt-2 text-xs text-neutral-500">{food.why}</p>
              </article>
            ))}
          </section>

          <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <IconSparkle className="h-4 w-4 text-brand-600 dark:text-brand-400" />
                Alasan pilihan ini
              </div>
              <button onClick={() => run(true)} disabled={loading} className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50">
                {loading ? "Menyusun..." : result.ai ? "Perbarui" : "Buat ringkasan"}
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-400">
              Berdasarkan sisa target harian dan preferensi makanmu.
            </p>
            {result.ai ? (
              <>
                <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">{result.ai.summary}</p>
                <ul className="mt-2 space-y-1.5 text-sm">
                  {result.ai.suggestions.map((x, i) => (
                    <li key={i} className="flex gap-2">
                      <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-neutral-400" />
                      {x}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-xs text-neutral-400">Buat ringkasan untuk melihat alasan di balik pilihan makanan ini.</p>
            )}
            {result.aiError && <p className="mt-2 text-xs text-red-500">{result.aiError}</p>}
          </section>
          <p className="text-xs text-neutral-400">{result.strategy.dataNote}</p>
        </>
      )}
    </div>
  );
}

// ---------- Today's meal/burn history ----------

function MealHistory({ log, timezone, onChanged }: { log: DayLog | null; timezone: string; onChanged: () => void }) {
  const [removing, setRemoving] = useState<string | null>(null);
  const [failed, setFailed] = useState<{ type: "meal" | "burn"; id: string; message: string } | null>(null);
  async function removeEntry(type: "meal" | "burn", id: string) {
    if (!log || removing) return;
    setRemoving(id);
    setFailed(null);
    try {
      const response = await fetch(`/api/log?type=${type}&id=${encodeURIComponent(id)}&date=${log.date}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Catatan belum terhapus. Coba lagi.");
      onChanged();
    } catch (cause) { setFailed({ type, id, message: cause instanceof Error ? cause.message : "Catatan belum terhapus. Coba lagi." }); }
    finally { setRemoving(null); }
  }

  if (!log) return null;

  return (
    <section id="riwayat" className="scroll-mt-4 space-y-2">
      <h2 className="px-1 text-sm font-medium text-neutral-500">Riwayat hari ini</h2>
      {failed && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{failed.message} <button type="button" disabled={Boolean(removing)} onClick={() => removeEntry(failed.type, failed.id)} className="font-semibold underline">Coba hapus lagi</button></p>}
      {log.meals.length === 0 && log.burns.length === 0 && <p className="rounded-2xl border border-dashed border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-700">Belum ada catatan hari ini. Mulai dengan satu makanan saja.</p>}
      {[...log.meals.map((m) => ({ ...m, kind: "meal" as const })), ...log.burns.map((b) => ({ ...b, kind: "burn" as const }))]
        .sort((a, b) => a.time.localeCompare(b.time))
        .map((entry) => (
          <div key={entry.id} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white px-4 py-3 shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  entry.kind === "meal" ? "bg-brand-50 text-brand-600 dark:bg-brand-950/40" : "bg-orange-50 text-orange-600 dark:bg-orange-950/40"
                }`}
              >
                {entry.kind === "meal" ? <IconBowl className="h-4 w-4" /> : <IconBolt className="h-4 w-4" />}
              </span>
              <div>
                <div className="text-sm font-medium">{entry.kind === "meal" ? entry.foodName : entry.label}</div>
                <div className="text-xs text-neutral-500">
                  {formatMealTime(entry.time, timezone)}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={entry.kind === "meal" ? "text-sm font-medium tabular-nums" : "text-sm font-medium tabular-nums text-brand-600"}>
                {entry.kind === "meal" ? "+" : "-"}
                {entry.calories} kcal
              </span>
              <button onClick={() => removeEntry(entry.kind, entry.id)} disabled={Boolean(removing)} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" aria-label={`Hapus ${entry.kind === "meal" ? entry.foodName : entry.label}`}>
                {removing === entry.id ? "…" : "✕"}
              </button>
            </div>
          </div>
        ))}
    </section>
  );
}
