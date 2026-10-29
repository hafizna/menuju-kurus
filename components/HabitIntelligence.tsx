"use client";

import { useEffect, useRef, useState } from "react";
import { mealTimeIso } from "@/lib/mealDraft";

type HabitMeal = {
  key: string;
  name: string;
  count: number;
  daysSeen: number;
  averageCalories: number;
  averageProteinG: number;
  averageCarbsG: number;
  averageFatG: number;
  portionNote?: string;
  usualWindow: string;
  lastSeenDate: string;
  confidence: "emerging" | "established";
};

type HabitStrategy = {
  lookbackDays: number;
  loggedDays: number;
  mealCount: number;
  readiness: "insufficient" | "learning" | "ready";
  readinessPercent: number;
  readinessMessage: string;
  recurringMeals: HabitMeal[];
  mealWindows: Array<{ id: string; label: string; count: number; sharePercent: number; averageCalories: number }>;
  insights: Array<{ id: string; tone: "supportive" | "watch" | "neutral"; title: string; detail: string; evidence: string }>;
  dataNote: string;
};

function readinessLabel(readiness: HabitStrategy["readiness"]): string {
  if (readiness === "ready") return "Pola siap digunakan";
  if (readiness === "learning") return "Sedang mempelajari pola";
  return "Data belum cukup";
}

function insightClass(tone: HabitStrategy["insights"][number]["tone"]): string {
  if (tone === "supportive") return "border-brand-200 bg-brand-50";
  if (tone === "watch") return "border-amber-200 bg-amber-50";
  return "border-neutral-200 bg-neutral-50";
}

export default function HabitIntelligence() {
  const [strategy, setStrategy] = useState<HabitStrategy | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [savedKey, setSavedKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [date, setDate] = useState("");
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [selected, setSelected] = useState<HabitMeal | null>(null);
  const [portion, setPortion] = useState("1");
  const [time, setTime] = useState("");
  const [undo, setUndo] = useState<{ id: string; date: string; name: string } | null>(null);
  const [undoing, setUndoing] = useState(false);
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const reduce = document.documentElement.dataset.motion === "off" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (selected) panel.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }, [selected]);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/habits");
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal membaca kebiasaan");
      setStrategy(data.strategy);
      setDate(data.date);
      setTimezone(data.timezone);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal membaca kebiasaan");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function quickAdd(meal: HabitMeal) {
    const multiplier = Number(portion);
    const eatenAt = mealTimeIso(time, date, timezone);
    if (!Number.isFinite(multiplier) || multiplier <= 0 || multiplier > 10 || !eatenAt) {
      setError("Cek porsi (lebih dari 0, maksimal 10) dan jam yang sudah terjadi hari ini. Muat ulang jika tanggal berganti.");
      return;
    }
    setSavingKey(meal.key);
    setSavedKey(null);
    setError("");
    try {
      const response = await fetch("/api/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "meal",
          date, time: eatenAt,
          foodName: meal.name,
          calories: Math.round(meal.averageCalories * multiplier),
          protein_g: Math.round(meal.averageProteinG * multiplier),
          carbs_g: Math.round(meal.averageCarbsG * multiplier),
          fat_g: Math.round(meal.averageFatG * multiplier),
          portionNote: `${multiplier} × ${meal.portionNote || "porsi biasanya"} · rata-rata ${meal.count} catatan`,
          source: "manual",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Gagal mencatat makanan");
      setSavedKey(meal.key);
      if (data.entry?.id) setUndo({ id: data.entry.id, date, name: meal.name });
      setSelected(null);
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Gagal mencatat makanan");
    } finally {
      setSavingKey(null);
    }
  }

  async function undoLast() {
    if (!undo || undoing) return;
    setUndoing(true); setError("");
    try {
      const response = await fetch(`/api/log?type=meal&id=${encodeURIComponent(undo.id)}&date=${undo.date}`, { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Belum berhasil dibatalkan. Catatan masih tersimpan.");
      setUndo(null); setSavedKey(null); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Gagal membatalkan. Coba lagi."); }
    finally { setUndoing(false); }
  }

  if (loading && !strategy) {
    return <p className="rounded-2xl border border-neutral-100 bg-white p-4 text-sm text-neutral-500">Membaca pola 28 hari terakhir...</p>;
  }

  if (!strategy) {
    return <div role="alert" className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-600"><p>{error || "Data kebiasaan belum tersedia."}</p><button onClick={load} className="mt-2 font-semibold underline">Coba lagi</button></div>;
  }

  return (
    <div className="space-y-4">
      {undo && <p role="status" className="rounded-2xl bg-brand-50 p-4 text-sm text-brand-800">{undo.name} tersimpan ✓ <button type="button" onClick={undoLast} disabled={undoing} className="ml-2 font-semibold underline">{undoing ? "Membatalkan…" : "Batalkan"}</button></p>}
      <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">Kesiapan data</p>
            <h2 className="mt-1 font-semibold">{readinessLabel(strategy.readiness)}</h2>
          </div>
          <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-xs tabular-nums text-neutral-600">
            {strategy.readinessPercent}%
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-neutral-100">
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${strategy.readinessPercent}%` }} />
        </div>
        <p className="mt-3 text-sm text-neutral-600">{strategy.readinessMessage}</p>
        <p className="mt-2 text-xs text-neutral-400">28 hari · {strategy.loggedDays} hari tercatat · {strategy.mealCount} makanan</p>
      </section>

      {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-600">{error} <button onClick={load} className="font-semibold underline">Muat ulang data</button></p>}

      <section className="space-y-2">
        <div className="px-1">
          <h2 className="font-semibold">Quick add dari kebiasaan</h2>
          <p className="text-xs text-neutral-500">Hanya menu yang muncul minimal dua kali. Nilai memakai rata-rata catatanmu sendiri.</p>
        </div>
        {strategy.recurringMeals.length ? (
          strategy.recurringMeals.map((meal) => (
            <article key={meal.key} className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="font-medium">{meal.name}</div>
                  <div className="mt-0.5 text-xs text-neutral-500">{meal.usualWindow} · {meal.count} kali pada {meal.daysSeen} hari</div>
                </div>
                <span className="shrink-0 text-right text-sm font-semibold tabular-nums">{meal.averageCalories} kcal</span>
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-xl bg-neutral-50 px-2 py-2"><strong className="block text-sm">{meal.averageProteinG} g</strong>protein</div>
                <div className="rounded-xl bg-neutral-50 px-2 py-2"><strong className="block text-sm">{meal.averageCarbsG} g</strong>karbo</div>
                <div className="rounded-xl bg-neutral-50 px-2 py-2"><strong className="block text-sm">{meal.averageFatG} g</strong>lemak</div>
              </div>
              {meal.portionNote && <p className="mt-2 text-xs text-neutral-500">Asumsi tersering: {meal.portionNote}</p>}
              <button
                onClick={() => { setSelected(meal); setPortion("1"); setTime(new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date())); }}
                disabled={Boolean(savingKey)}
                className="mt-3 w-full rounded-xl bg-brand-600 py-2.5 text-sm font-medium text-white disabled:opacity-50"
              >
                {savingKey === meal.key ? "Menyimpan..." : "Cek porsi & tambahkan"}
              </button>
            </article>
          ))
        ) : (
          <p className="rounded-2xl border border-dashed border-neutral-200 p-4 text-sm text-neutral-500">Belum ada menu yang berulang minimal dua kali.</p>
        )}
      </section>

      {selected && <fieldset disabled={Boolean(savingKey)} className="min-w-0"><section ref={panel} role="dialog" aria-label="Cek porsi makanan kebiasaan" className="space-y-3 rounded-2xl border-2 border-brand-200 bg-white p-4"><h2 className="font-semibold">{selected.name}</h2><label className="flex items-center justify-between gap-3 text-sm">Jumlah porsi<input aria-label="Jumlah porsi" type="number" min="0.25" max="10" step="0.25" value={portion} onChange={(e) => setPortion(e.target.value)} className="w-24 rounded-lg border border-neutral-300 p-2" /></label><label className="flex items-center justify-between gap-3 text-sm">Jam makan ({timezone})<input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="rounded-lg border border-neutral-300 p-2" /></label><p className="text-sm font-semibold">≈ {Math.round(selected.averageCalories * (Number(portion) || 0))} kcal</p><div className="flex gap-2"><button type="button" onClick={() => setSelected(null)} disabled={Boolean(savingKey)} className="rounded-xl border border-neutral-200 px-4 py-3 text-sm">Tutup</button><button type="button" onClick={() => quickAdd(selected)} disabled={Boolean(savingKey)} className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-semibold text-white disabled:opacity-50">{savingKey ? "Menyimpan…" : "Tambahkan ke hari ini"}</button></div></section></fieldset>}

      {strategy.mealWindows.length > 0 && (
        <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs">
          <h2 className="font-semibold">Waktu makan yang tercatat</h2>
          <div className="mt-3 space-y-3">
            {strategy.mealWindows.map((window) => (
              <div key={window.id}>
                <div className="flex items-center justify-between text-sm">
                  <span>{window.label}</span>
                  <span className="tabular-nums text-neutral-500">{window.sharePercent}% · {window.count}x</span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-neutral-100">
                  <div className="h-full rounded-full bg-brand-500" style={{ width: `${window.sharePercent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {strategy.insights.length > 0 && (
        <section className="space-y-2">
          <div className="px-1">
            <h2 className="font-semibold">Pola yang perlu diketahui</h2>
            <p className="text-xs text-neutral-500">Sinyal untuk keputusan berikutnya, bukan vonis atau hubungan sebab-akibat.</p>
          </div>
          {strategy.insights.map((insight) => (
            <article key={insight.id} className={`rounded-2xl border p-4 ${insightClass(insight.tone)}`}>
              <h3 className="font-medium">{insight.title}</h3>
              <p className="mt-1 text-sm text-neutral-600">{insight.detail}</p>
              <p className="mt-2 text-xs font-medium text-neutral-500">{insight.evidence}</p>
            </article>
          ))}
        </section>
      )}

      <p className="px-1 text-xs text-neutral-400">{strategy.dataNote}</p>
    </div>
  );
}
