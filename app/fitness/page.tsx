"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { FitnessIntelligence } from "@/lib/fitnessIntelligence";

interface AiSummary {
  summary: string;
  recommendations: string[];
}

export default function FitnessPage() {
  const [data, setData] = useState<FitnessIntelligence | null>(null);
  const [ai, setAi] = useState<AiSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/fitness-intelligence")
      .then((r) => r.json())
      .then((d) => setData(d.intelligence))
      .finally(() => setLoading(false));
  }, []);

  async function generateAi() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/fitness-intelligence", { method: "POST" });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Gagal membuat recap");
      setAi(result.ai);
      setData(result.intelligence);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Gagal membuat recap");
    } finally {
      setGenerating(false);
    }
  }

  if (loading || !data) return <div className="p-6 text-center text-neutral-400">Memuat...</div>;

  const statusText = data.scoreLabel === "on-track" ? "On track" : data.scoreLabel === "building" ? "Sedang dibangun" : "Perlu perhatian";

  return (
    <div className="space-y-4 p-4">
      <header className="flex items-start justify-between pt-2">
        <div>
          <h1 className="text-xl font-bold">🏃 Fitness Intelligence</h1>
          <p className="text-sm text-neutral-500">Fokus: {data.label}</p>
        </div>
        <Link href="/settings" className="text-sm text-brand-600">Ubah goal</Link>
      </header>

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <div className="flex items-end justify-between">
          <div>
            <div className="text-sm text-neutral-500">{data.label} Score</div>
            <div className="text-4xl font-bold">{data.score}<span className="text-base text-neutral-400">/100</span></div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium text-brand-600">{statusText}</div>
            <div className="text-xs text-neutral-400">Confidence: {data.dataConfidence}</div>
          </div>
        </div>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-300">{data.recap}</p>
      </section>

      <section className="grid grid-cols-2 gap-3">
        <Metric label="Tren berat" value={data.weightTrendKgWeek === null ? "Belum ada" : `${data.weightTrendKgWeek > 0 ? "+" : ""}${data.weightTrendKgWeek} kg/mgg`} />
        <Metric label="Body fat" value={data.bodyFatLatest === null ? "Belum ada" : `${data.bodyFatLatest}%`} note="estimasi perangkat" />
        <Metric label="VO₂ max" value={data.vo2Max === null ? "Belum ada" : String(data.vo2Max)} note="estimasi cardio fitness" />
        <Metric label="Resting HR" value={data.restingHeartRate === null ? "Belum ada" : `${data.restingHeartRate} bpm`} />
        <Metric label="Kardio" value={`${data.cardioMinutes} menit`} note="minggu ini" />
        <Metric label="Strength" value={`${data.strengthDays} hari`} note="minggu ini" />
      </section>

      <section className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <div className="mb-2 text-sm font-medium">Prioritas berikutnya</div>
        {data.priorities.length ? (
          <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
            {data.priorities.map((item, index) => <li key={index}>👉 {item}</li>)}
          </ul>
        ) : (
          <p className="text-sm text-neutral-500">Pertahankan pola saat ini dan terus kumpulkan data.</p>
        )}
      </section>

      <section className="space-y-3 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium">✨ Recap Gemini</div>
            <div className="text-xs text-neutral-400">Manual saja, agar hemat quota</div>
          </div>
          <button onClick={generateAi} disabled={generating} className="rounded-lg bg-brand-600 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
            {generating ? "Membuat..." : ai ? "Buat ulang" : "Buat recap"}
          </button>
        </div>
        {error && <p className="text-sm text-red-500">{error}</p>}
        {ai && (
          <>
            <p className="text-sm text-neutral-600 dark:text-neutral-300">{ai.summary}</p>
            <ul className="space-y-1 text-sm text-neutral-600 dark:text-neutral-300">
              {ai.recommendations.map((item, index) => <li key={index}>• {item}</li>)}
            </ul>
          </>
        )}
      </section>

      <p className="px-1 text-xs text-neutral-400">Bukan diagnosis medis. VO₂ max dan body fat dari wearable atau smart scale adalah estimasi; keputusan memakai tren, bukan satu angka.</p>
    </div>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="mt-1 text-lg font-bold">{value}</div>
      {note && <div className="text-xs text-neutral-400">{note}</div>}
    </div>
  );
}
