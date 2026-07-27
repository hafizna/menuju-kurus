"use client";

import { useEffect, useState } from "react";
import type { WeightEntry } from "@/lib/types";
import type { WeightTrend } from "@/lib/weight";
import WeightChart from "@/components/WeightChart";
import WeightForecastCard from "@/components/WeightForecastCard";

export default function WeightTab() {
  const [entries, setEntries] = useState<WeightEntry[]>([]);
  const [trend, setTrend] = useState<WeightTrend | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [weightInput, setWeightInput] = useState("");
  const [bodyFatInput, setBodyFatInput] = useState("");
  const [noteInput, setNoteInput] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const res = await fetch("/api/weight");
    if (res.ok) {
      const data = await res.json();
      setEntries(data.entries);
      setTrend(data.trend);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const weightKg = Number(weightInput);
    if (!weightKg || weightKg <= 0) return;
    setSaving(true);
    try {
      await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          weightKg,
          bodyFat: bodyFatInput ? Number(bodyFatInput) : undefined,
          note: noteInput || undefined,
        }),
      });
      setWeightInput("");
      setBodyFatInput("");
      setNoteInput("");
      setShowForm(false);
      setShowDetail(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function removeEntry(id: string) {
    await fetch(`/api/weight?id=${id}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="space-y-4">
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          className="block w-full rounded-xl bg-brand-600 py-4 text-center font-medium text-white"
        >
          + Timbang Hari Ini
        </button>
      ) : (
        <form onSubmit={save} className="space-y-3 rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              value={weightInput}
              onChange={(e) => setWeightInput(e.target.value)}
              inputMode="decimal"
              placeholder="78.4"
              className="flex-1 rounded-lg border border-neutral-300 px-3 py-3 text-center text-2xl dark:border-neutral-700 dark:bg-neutral-800"
            />
            <span className="text-neutral-500">kg</span>
          </div>

          {showDetail ? (
            <div className="space-y-2">
              <input
                value={bodyFatInput}
                onChange={(e) => setBodyFatInput(e.target.value)}
                inputMode="decimal"
                placeholder="Body fat % (opsional)"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              />
              <input
                value={noteInput}
                onChange={(e) => setNoteInput(e.target.value)}
                placeholder="Catatan (opsional)"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800"
              />
            </div>
          ) : (
            <button type="button" onClick={() => setShowDetail(true)} className="text-xs text-neutral-400 underline">
              + tambah detail (body fat / catatan)
            </button>
          )}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="flex-1 rounded-xl border border-neutral-300 py-3 text-sm font-medium dark:border-neutral-700"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving || !weightInput}
              className="flex-1 rounded-xl bg-brand-600 py-3 text-sm font-medium text-white disabled:opacity-50"
            >
              {saving ? "Menyimpan..." : "Simpan"}
            </button>
          </div>
        </form>
      )}

      {trend && (
        <div className="grid grid-cols-2 divide-x divide-y divide-neutral-100 rounded-2xl border border-neutral-100 bg-white shadow-sm dark:divide-neutral-800 dark:border-neutral-800 dark:bg-neutral-900">
          <StatTile label="Hari ini" value={trend.today !== null ? `${trend.today} kg` : "-"} />
          <StatTile label="Rata-rata 7 hari" value={trend.avg7 !== null ? `${trend.avg7} kg` : "-"} />
          <StatTile label="Rata-rata 14 hari" value={trend.avg14 !== null ? `${trend.avg14} kg` : "-"} />
          <StatTile
            label="Tren mingguan"
            value={
              trend.weeklyRate !== null
                ? `${trend.weeklyRate > 0 ? "+" : ""}${trend.weeklyRate} kg${
                    trend.direction === "down" ? " ↓" : trend.direction === "up" ? " ↑" : " →"
                  }`
                : "-"
            }
            accent={trend.direction === "down" ? "text-brand-600" : trend.direction === "up" ? "text-red-500" : ""}
          />
        </div>
      )}

      {trend && <WeightForecastCard trend={trend} />}

      <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mb-2 text-sm font-medium text-neutral-500">Grafik 30 catatan terakhir</div>
        <WeightChart entries={entries} />
      </section>

      {entries.length > 0 && (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-medium text-neutral-500">Riwayat</h2>
          {entries
            .slice()
            .reverse()
            .slice(0, 14)
            .map((e) => (
              <div key={e.id} className="flex items-center justify-between rounded-xl border border-neutral-100 bg-white px-4 py-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
                <div>
                  <div className="text-sm font-medium">{e.weightKg} kg</div>
                  <div className="text-xs text-neutral-500">
                    {e.date}
                    {e.bodyFat ? ` · ${e.bodyFat}% BF` : ""}
                    {e.note ? ` · ${e.note}` : ""}
                  </div>
                </div>
                <button onClick={() => removeEntry(e.id)} className="text-neutral-300 hover:text-red-400" aria-label="Hapus">
                  ✕
                </button>
              </div>
            ))}
        </section>
      )}
    </div>
  );
}

function StatTile({ label, value, accent = "" }: { label: string; value: string; accent?: string }) {
  return (
    <div className="p-4 text-center">
      <div className={`text-xl font-bold tabular-nums ${accent}`}>{value}</div>
      <div className="text-xs text-neutral-500">{label}</div>
    </div>
  );
}
