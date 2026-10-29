"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconBolt, IconBowl } from "@/components/icons";
import { describeActivity } from "@/lib/activity";
import { lastNDateKeys } from "@/lib/dates";
import { formatMealTime } from "@/lib/mealDraft";
import { recapDay } from "@/lib/dayRecap";
import { adjustMeal } from "@/lib/mealMath";
import type { DayLog, MealEntry } from "@/lib/types";
import DayRecap from "./DayRecap";
import MealCorrection from "./MealCorrection";

// The last seven days can be opened and corrected, the same window the weekly
// review looks at (lib/mealEdit.ts enforces it on the server).
const DAYS = 7;

function dayLabel(date: string, today: string): string {
  if (date === today) return "Hari ini";
  const gap = Math.round((Date.parse(today) - Date.parse(date)) / 86_400_000);
  if (gap === 1) return "Kemarin";
  return new Date(`${date}T12:00:00Z`).toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

interface Props {
  todayDate: string | null;
  todayLog: DayLog | null;
  timezone: string;
  /** Daily calorie and protein targets, for the rings. */
  targets: { kcal: number; protein: number };
  onChanged: () => void;
}

export default function MealHistory({ todayDate, todayLog, timezone, targets, onChanged }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [pastLog, setPastLog] = useState<DayLog | null>(null);
  const [loadError, setLoadError] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [fixing, setFixing] = useState<MealEntry | null>(null);
  const [notice, setNotice] = useState("");
  const [removing, setRemoving] = useState<string | null>(null);
  // The day shows as rings first; the meals behind them open on a tap.
  const [itemsOpen, setItemsOpen] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState("");
  const [failed, setFailed] = useState<{ type: "meal" | "burn"; id: string; message: string } | null>(null);
  const trigger = useRef<HTMLElement | null>(null);

  const date = selected ?? todayDate;
  const isToday = !selected || selected === todayDate;
  const log = isToday ? todayLog : pastLog;

  const loadPast = useCallback(async (day: string) => {
    setLoadError("");
    try {
      const response = await fetch(`/api/log?date=${day}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.log) throw new Error(data.error || "Catatan hari itu belum bisa dibuka.");
      setPastLog(data.log as DayLog);
    } catch (cause) {
      setLoadError(cause instanceof Error ? cause.message : "Catatan hari itu belum bisa dibuka.");
    }
  }, []);

  useEffect(() => {
    if (!selected || selected === todayDate) return;
    setPastLog(null);
    void loadPast(selected);
  }, [selected, todayDate, loadPast]);

  async function refresh() {
    if (selected && selected !== todayDate) await loadPast(selected);
    onChanged();
  }

  async function removeEntry(type: "meal" | "burn", id: string) {
    if (!log || removing) return;
    setRemoving(id); setFailed(null); setNotice("");
    try {
      const response = await fetch(`/api/log?type=${type}&id=${encodeURIComponent(id)}&date=${log.date}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Catatan belum terhapus. Coba lagi.");
      await refresh();
    } catch (cause) { setFailed({ type, id, message: cause instanceof Error ? cause.message : "Catatan belum terhapus. Coba lagi." }); }
    finally { setRemoving(null); }
  }

  async function markComplete() {
    if (!log || completing) return;
    setCompleting(true); setCompleteError("");
    try {
      const response = await fetch("/api/log", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ date: log.date, foodLogComplete: true }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Status belum tersimpan. Coba lagi.");
      await refresh();
    } catch (cause) { setCompleteError(cause instanceof Error ? cause.message : "Status belum tersimpan. Coba lagi."); }
    finally { setCompleting(false); }
  }

  function closeFix() {
    setFixing(null);
    trigger.current?.focus();
  }

  if (!todayDate || !date) return null;
  const days = lastNDateKeys(DAYS, timezone).reverse();
  const entries = log ? [...log.meals.map((m) => ({ ...m, kind: "meal" as const })), ...log.burns.map((b) => ({ ...b, kind: "burn" as const }))].sort((a, b) => a.time.localeCompare(b.time)) : [];

  return (
    <section id="riwayat" className="scroll-mt-4 space-y-2">
      <h2 className="px-1 text-sm font-medium text-neutral-500">{isToday ? "Riwayat hari ini" : `Riwayat ${dayLabel(date, todayDate)}`}</h2>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label="Pilih hari">
        {days.map((day) => (
          <button
            key={day}
            type="button"
            aria-pressed={day === date}
            onClick={() => { setSelected(day === todayDate ? null : day); setOpenId(null); setItemsOpen(false); setCompleteError(""); setFailed(null); setNotice(""); }}
            className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium ${day === date ? "border-brand-600 bg-brand-600 text-white" : "border-neutral-300 text-neutral-600 dark:border-neutral-700 dark:text-neutral-300"}`}
          >
            {dayLabel(day, todayDate)}
          </button>
        ))}
      </div>
      <p className="px-1 text-xs text-neutral-500">Ketuk ringkasan untuk melihat tiap makanan, lalu ketuk makanan untuk rincian dan koreksi. Bisa sampai {DAYS - 1} hari ke belakang.</p>

      {notice && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-950/30 dark:text-brand-200">{notice}</p>}
      {failed && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{failed.message} <button type="button" disabled={Boolean(removing)} onClick={() => removeEntry(failed.type, failed.id)} className="font-semibold underline">Coba hapus lagi</button></p>}
      {loadError && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">{loadError} <button type="button" onClick={() => selected && void loadPast(selected)} className="font-semibold underline">Coba lagi</button></p>}
      {!log && !loadError && !isToday && <p role="status" className="p-3 text-sm text-neutral-500">Memuat…</p>}
      {log && entries.length === 0 && (
        <p className="rounded-2xl border border-dashed border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-700">
          {isToday ? "Belum ada catatan hari ini. Mulai dengan satu makanan saja." : "Tidak ada catatan pada hari ini."}
        </p>
      )}
      {log && entries.length > 0 && (
        <DayRecap
          key={log.date}
          recap={recapDay(log, targets)}
          open={itemsOpen}
          onToggle={() => setItemsOpen((value) => !value)}
          controls="riwayat-items"
          isToday={isToday}
          completing={completing}
          completeError={completeError}
          onComplete={() => void markComplete()}
        />
      )}
      <div id="riwayat-items" hidden={!itemsOpen} className="space-y-2">
      {entries.map((entry) => {
        const open = entry.kind === "meal" && openId === entry.id;
        const heading = (
          <>
            <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${entry.kind === "meal" ? "bg-brand-50 text-brand-600 dark:bg-brand-950/40" : "bg-orange-50 text-orange-600 dark:bg-orange-950/40"}`}>
              {entry.kind === "meal" ? <IconBowl className="h-4 w-4" /> : <IconBolt className="h-4 w-4" />}
            </span>
            <span className="min-w-0">
              <span className="block break-words text-sm font-medium">{entry.kind === "meal" ? entry.foodName : describeActivity(entry.label, entry.durationMin)}</span>
              <span className="block text-xs text-neutral-500">
                {formatMealTime(entry.time, timezone)}
                {entry.kind === "meal" && entry.editedAt && " · dikoreksi"}
                {entry.kind === "meal" && !open && " · lihat rincian"}
              </span>
            </span>
          </>
        );
        return (
          <div key={entry.id} className="rounded-xl border border-neutral-100 bg-white shadow-xs dark:border-neutral-800 dark:bg-neutral-900">
            <div className="flex items-center justify-between gap-2 px-4 py-3">
              {entry.kind === "meal" ? (
                <button type="button" aria-expanded={open} aria-controls={`detail-${entry.id}`} onClick={() => setOpenId(open ? null : entry.id)} className="flex min-w-0 flex-1 items-center gap-3 text-left">{heading}</button>
              ) : (
                <div className="flex min-w-0 flex-1 items-center gap-3">{heading}</div>
              )}
              <div className="flex shrink-0 items-center gap-2">
                <span className={entry.kind === "meal" ? "text-sm font-medium tabular-nums" : "text-sm font-medium tabular-nums text-brand-600"}>
                  {entry.kind === "meal" ? "+" : "-"}
                  {entry.calories} kcal
                </span>
                <button onClick={() => removeEntry(entry.kind, entry.id)} disabled={Boolean(removing)} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50" aria-label={`Hapus ${entry.kind === "meal" ? entry.foodName : entry.label}`}>
                  {removing === entry.id ? "…" : "✕"}
                </button>
              </div>
            </div>
            {open && entry.kind === "meal" && (
              <MealDetail
                id={`detail-${entry.id}`}
                meal={entry}
                onFix={(button) => { trigger.current = button; setFixing(entry); }}
              />
            )}
          </div>
        );
      })}
      </div>

      {fixing && (
        <MealCorrection
          key={fixing.id}
          meal={fixing}
          date={date}
          timezone={timezone}
          onClose={closeFix}
          onSaved={(message) => { setNotice(`Koreksi tersimpan: ${message}`); closeFix(); void refresh(); }}
        />
      )}
    </section>
  );
}

function MealDetail({ id, meal, onFix }: { id: string; meal: MealEntry; onFix: (button: HTMLElement) => void }) {
  const breakdown = meal.breakdown;
  const components = breakdown ? adjustMeal(breakdown.analysis, breakdown.adjust).components : [];
  return (
    <div id={id} className="space-y-2 border-t border-neutral-100 px-4 py-3 text-xs dark:border-neutral-800">
      <p className="tabular-nums text-neutral-600 dark:text-neutral-300">
        Protein {meal.protein_g} g · Karbo {meal.carbs_g} g · Lemak {meal.fat_g} g
        {meal.sugar_g !== undefined && ` · Gula tambahan ${meal.sugar_g} g`}
      </p>
      {components.length > 0 ? (
        <ul className="space-y-1 rounded-lg bg-neutral-50 p-2.5 dark:bg-neutral-800/60" aria-label="Rincian bahan">
          {components.map((component, index) => (
            <li key={index} className="flex justify-between gap-3">
              <span className="min-w-0 truncate text-neutral-600 dark:text-neutral-300">
                {component.name}
                {component.grams > 0 && <span className="text-neutral-400"> · ±{component.grams} g</span>}
              </span>
              <span className="shrink-0 tabular-nums text-neutral-500">{component.calories} kcal · {component.protein_g} g protein</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-neutral-500">
          {meal.source === "photo" ? "Rincian bahan tidak tersimpan untuk catatan ini." : "Dicatat manual, jadi tidak ada rincian bahan."}
        </p>
      )}
      {breakdown?.described && <p className="text-neutral-500">Yang kamu tulis: {breakdown.described}</p>}
      {breakdown?.note && <p className="text-neutral-500">Keterangan: {breakdown.note}</p>}
      {(breakdown?.kcalEdit != null || breakdown?.proteinEdit != null) && (
        <p className="text-neutral-500">{[breakdown?.kcalEdit != null && "Kalori", breakdown?.proteinEdit != null && "Protein"].filter(Boolean).join(" dan ")} memakai angka yang diisi, bukan hitungan rincian.</p>
      )}
      {meal.portionNote && <p className="text-neutral-500">{meal.portionNote}</p>}
      {meal.editedAt && <p className="text-neutral-400">Dikoreksi {new Date(meal.editedAt).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" })}</p>}
      <button type="button" onClick={(event) => onFix(event.currentTarget)} className="rounded-lg border border-brand-600 px-3 py-2 text-sm font-semibold text-brand-700 dark:text-brand-300">Koreksi</button>
    </div>
  );
}
