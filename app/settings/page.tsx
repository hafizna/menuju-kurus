"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { FitnessGoal, UserSettings } from "@/lib/types";

const GOALS: { value: FitnessGoal; label: string; description: string }[] = [
  { value: "weight_loss", label: "Weight loss", description: "Turun berat dengan pola yang konsisten." },
  { value: "very_lean", label: "Very lean", description: "Turun lemak sambil menjaga otot dan energi." },
  { value: "athletic", label: "Athletic", description: "Kardio, kekuatan, dan komposisi tubuh seimbang." },
  { value: "muscle_gain", label: "Muscle gain", description: "Naik massa otot dengan surplus terkontrol." },
];

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [userName, setUserName] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d) => setSettings(d.settings));
    fetch("/api/me").then((r) => r.json()).then((d) => setUserName(d.name ?? ""));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      const data = await res.json();
      setSettings(data.settings);
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.replace("/login");
  }

  if (!settings) return <div className="p-6 text-center text-neutral-400">Memuat...</div>;
  const inputClass = "w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800";

  return (
    <div className="space-y-4 p-4">
      <h1 className="pt-2 text-xl font-bold">⚙️ Pengaturan</h1>
      {userName && <p className="text-sm text-neutral-500">Masuk sebagai {userName}</p>}

      <form onSubmit={save} className="space-y-5 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <div>
          <div className="mb-2 text-sm font-medium">Tujuan utama</div>
          <div className="grid grid-cols-2 gap-2">
            {GOALS.map((goal) => (
              <button
                key={goal.value}
                type="button"
                onClick={() => setSettings({ ...settings, fitnessGoal: goal.value })}
                className={`rounded-xl border p-3 text-left ${settings.fitnessGoal === goal.value ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30" : "border-neutral-200 dark:border-neutral-700"}`}
              >
                <div className="text-sm font-medium">{goal.label}</div>
                <div className="mt-1 text-xs text-neutral-500">{goal.description}</div>
              </button>
            ))}
          </div>
        </div>

        <Field label="Target kalori harian (kcal)"><input type="number" value={settings.dailyTargetKcal} onChange={(e) => setSettings({ ...settings, dailyTargetKcal: Number(e.target.value) })} className={inputClass} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Berat acuan (kg)"><input type="number" step="0.1" value={settings.weightKg} onChange={(e) => setSettings({ ...settings, weightKg: Number(e.target.value) })} className={inputClass} /></Field>
          <Field label="Target berat (kg)"><input type="number" step="0.1" value={settings.goalWeightKg} onChange={(e) => setSettings({ ...settings, goalWeightKg: Number(e.target.value) })} className={inputClass} /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target protein (g)"><input type="number" value={settings.proteinTargetG} onChange={(e) => setSettings({ ...settings, proteinTargetG: Number(e.target.value) })} className={inputClass} /></Field>
          <Field label="Target body fat %"><input type="number" step="0.1" value={settings.targetBodyFatPercent ?? ""} onChange={(e) => setSettings({ ...settings, targetBodyFatPercent: e.target.value ? Number(e.target.value) : null })} placeholder="Opsional" className={inputClass} /></Field>
        </div>

        <div className="border-t border-neutral-100 pt-4 dark:border-neutral-800">
          <div className="mb-3 text-sm font-medium">Metrik fitness terbaru</div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="VO₂ max"><input type="number" step="0.1" value={settings.vo2Max ?? ""} onChange={(e) => setSettings({ ...settings, vo2Max: e.target.value ? Number(e.target.value) : null })} placeholder="Opsional" className={inputClass} /></Field>
            <Field label="Resting HR"><input type="number" value={settings.restingHeartRate ?? ""} onChange={(e) => setSettings({ ...settings, restingHeartRate: e.target.value ? Number(e.target.value) : null })} placeholder="bpm" className={inputClass} /></Field>
            <Field label="Kardio / minggu"><input type="number" value={settings.cardioMinutesWeekly} onChange={(e) => setSettings({ ...settings, cardioMinutesWeekly: Number(e.target.value) })} className={inputClass} /></Field>
            <Field label="Strength days"><input type="number" min="0" max="7" value={settings.strengthDaysWeekly} onChange={(e) => setSettings({ ...settings, strengthDaysWeekly: Number(e.target.value) })} className={inputClass} /></Field>
          </div>
          <p className="mt-2 text-xs text-neutral-400">VO₂ max dan body fat dari perangkat adalah estimasi. Engine memakai tren dan memberi confidence level.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Window makan (jam)"><input type="number" value={settings.ifWindowHours} onChange={(e) => setSettings({ ...settings, ifWindowHours: Number(e.target.value) })} className={inputClass} /></Field>
          <Field label="Timezone"><input value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} className={inputClass} /></Field>
        </div>

        <button type="submit" disabled={saving} className="w-full rounded-xl bg-brand-600 py-3 font-medium text-white disabled:opacity-50">
          {saving ? "Menyimpan..." : saved ? "Tersimpan ✓" : "Simpan"}
        </button>
      </form>

      <section className="rounded-2xl bg-white p-4 text-sm text-neutral-500 shadow-sm dark:bg-neutral-900">
        <div className="mb-1 font-medium text-neutral-700 dark:text-neutral-300">Apple Health</div>
        Active Energy sudah bisa dikirim melalui Shortcut. Berat, body fat, VO₂ max, resting heart rate, dan workout akan disambungkan pada Health Sync V2.
      </section>

      <button onClick={logout} className="w-full rounded-xl border border-red-300 py-3 font-medium text-red-500 dark:border-red-900">Keluar</button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-sm text-neutral-500">{label}</span>{children}</label>;
}
