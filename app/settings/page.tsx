"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { ActivityLevel, BiologicalSex, FitnessGoal, UserSettings } from "@/lib/types";
import type { ProgramRecommendation } from "@/lib/programCalories";

const GOALS: { value: FitnessGoal; label: string; description: string }[] = [
  { value: "weight_loss", label: "Weight loss", description: "Turun berat dengan defisit moderat." },
  { value: "very_lean", label: "Very lean", description: "Defisit lebih konservatif sambil menjaga otot." },
  { value: "athletic", label: "Athletic", description: "Mulai dari maintenance dan fokus performa." },
  { value: "muscle_gain", label: "Muscle gain", description: "Surplus kecil dan terkontrol." },
];
const ACTIVITIES: { value: ActivityLevel; label: string; description: string }[] = [
  { value: "sedentary", label: "Sedentary", description: "Mayoritas duduk, hampir tidak berolahraga." },
  { value: "light", label: "Ringan", description: "Aktif ringan atau latihan 1–3 hari/minggu." },
  { value: "moderate", label: "Sedang", description: "Latihan 3–5 hari/minggu." },
  { value: "very_active", label: "Sangat aktif", description: "Latihan berat atau pekerjaan fisik." },
];

type SettingsResponse = { settings: UserSettings; recommendation: ProgramRecommendation };

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [recommendation, setRecommendation] = useState<ProgramRecommendation | null>(null);
  const [userName, setUserName] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings").then((r) => r.json()).then((d: SettingsResponse) => { setSettings(d.settings); setRecommendation(d.recommendation); });
    fetch("/api/me").then((r) => r.json()).then((d) => setUserName(d.name ?? ""));
  }, []);

  async function persist(applyRecommendation = false) {
    if (!settings) return;
    setSaving(true); setSaved(false);
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, applyRecommendation }) });
      const data: SettingsResponse = await res.json();
      setSettings(data.settings); setRecommendation(data.recommendation); setSaved(true);
    } finally { setSaving(false); }
  }

  async function save(e: React.FormEvent) { e.preventDefault(); await persist(false); }
  async function logout() { await fetch("/api/auth", { method: "DELETE" }); router.replace("/login"); }

  if (!settings) return <div className="p-6 text-center text-neutral-400">Memuat...</div>;
  const inputClass = "w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800";

  return (
    <div className="space-y-4 p-4">
      <header className="pt-2"><h1 className="text-xl font-bold">Program Saya</h1>{userName && <p className="text-sm text-neutral-500">Masuk sebagai {userName}</p>}</header>

      {!settings.programConfigured && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30"><div className="font-semibold">Lengkapi profil program</div><p className="mt-1 text-neutral-600 dark:text-neutral-300">Angka 1.800 kcal dan 120 g protein saat ini masih nilai awal, bukan rekomendasi personal.</p></section>}

      <form onSubmit={save} className="space-y-4">
        <Section title="1. Tujuan utama" description="Goal menentukan arah penyesuaian dari kebutuhan maintenance.">
          <div className="grid grid-cols-2 gap-2">{GOALS.map((goal) => <button key={goal.value} type="button" onClick={() => setSettings({ ...settings, fitnessGoal: goal.value })} className={`rounded-xl border p-3 text-left ${settings.fitnessGoal === goal.value ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30" : "border-neutral-200 dark:border-neutral-700"}`}><div className="text-sm font-medium">{goal.label}</div><div className="mt-1 text-xs text-neutral-500">{goal.description}</div></button>)}</div>
        </Section>

        <Section title="2. Data tubuh" description="Digunakan untuk BMI, BMR, dan estimasi kebutuhan energi.">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Usia"><input type="number" value={settings.age ?? ""} onChange={(e) => setSettings({ ...settings, age: e.target.value ? Number(e.target.value) : null })} placeholder="tahun" className={inputClass} /></Field>
            <Field label="Jenis kelamin biologis"><select value={settings.biologicalSex ?? ""} onChange={(e) => setSettings({ ...settings, biologicalSex: (e.target.value || null) as BiologicalSex | null })} className={inputClass}><option value="">Pilih</option><option value="male">Laki-laki</option><option value="female">Perempuan</option></select></Field>
            <Field label="Tinggi badan"><input type="number" value={settings.heightCm ?? ""} onChange={(e) => setSettings({ ...settings, heightCm: e.target.value ? Number(e.target.value) : null })} placeholder="cm" className={inputClass} /></Field>
            <Field label="Berat acuan"><input type="number" step="0.1" value={settings.weightKg} onChange={(e) => setSettings({ ...settings, weightKg: Number(e.target.value) })} className={inputClass} /></Field>
            <Field label="Target berat"><input type="number" step="0.1" value={settings.goalWeightKg} onChange={(e) => setSettings({ ...settings, goalWeightKg: Number(e.target.value) })} className={inputClass} /></Field>
            <Field label="Target body fat %"><input type="number" step="0.1" value={settings.targetBodyFatPercent ?? ""} onChange={(e) => setSettings({ ...settings, targetBodyFatPercent: e.target.value ? Number(e.target.value) : null })} placeholder="Opsional" className={inputClass} /></Field>
          </div>
        </Section>

        <Section title="3. Level aktivitas" description="Pilih kondisi yang paling mendekati minggu normal, bukan minggu paling aktif.">
          <div className="space-y-2">{ACTIVITIES.map((item) => <button key={item.value} type="button" onClick={() => setSettings({ ...settings, activityLevel: item.value })} className={`w-full rounded-xl border p-3 text-left ${settings.activityLevel === item.value ? "border-brand-500 bg-brand-50 dark:bg-brand-950/30" : "border-neutral-200 dark:border-neutral-700"}`}><div className="text-sm font-medium">{item.label}</div><div className="text-xs text-neutral-500">{item.description}</div></button>)}</div>
        </Section>

        <button type="submit" disabled={saving} className="w-full rounded-xl border border-brand-500 py-3 font-medium text-brand-600 disabled:opacity-50">{saving ? "Menghitung..." : "Hitung rekomendasi"}</button>

        {recommendation?.complete && <Section title="Rekomendasi program" description={`Confidence ${recommendation.confidence}. Angka dibulatkan agar praktis digunakan.`}>
          <div className="grid grid-cols-2 gap-3 text-center">
            <Stat label="BMI" value={`${recommendation.bmi}`} note={recommendation.bmiLabel} />
            <Stat label="Maintenance" value={`${recommendation.maintenanceCalories} kcal`} note={`BMR ${recommendation.bmr} kcal`} />
            <Stat label="Target kalori" value={`${recommendation.recommendedCalories} kcal`} note={`${recommendation.adjustmentPercent}% dari maintenance`} />
            <Stat label="Target protein" value={`${recommendation.recommendedProteinG} g`} note="per hari" />
          </div>
          <ul className="mt-3 space-y-1 text-xs text-neutral-500">{recommendation.notes.map((note, i) => <li key={i}>• {note}</li>)}</ul>
          <button type="button" onClick={() => persist(true)} disabled={saving} className="mt-4 w-full rounded-xl bg-brand-600 py-3 font-medium text-white disabled:opacity-50">Gunakan rekomendasi</button>
          <p className="mt-2 text-center text-xs text-neutral-400">Target tidak akan berubah sebelum tombol ini ditekan.</p>
        </Section>}

        <Section title="Target aktif" description="Boleh disesuaikan manual setelah program diterapkan.">
          <div className="grid grid-cols-2 gap-3"><Field label="Kalori harian"><input type="number" value={settings.dailyTargetKcal} onChange={(e) => setSettings({ ...settings, dailyTargetKcal: Number(e.target.value) })} className={inputClass} /></Field><Field label="Protein harian"><input type="number" value={settings.proteinTargetG} onChange={(e) => setSettings({ ...settings, proteinTargetG: Number(e.target.value) })} className={inputClass} /></Field></div>
          <div className="mt-3 grid grid-cols-2 gap-3"><Field label="Window makan"><input type="number" value={settings.ifWindowHours} onChange={(e) => setSettings({ ...settings, ifWindowHours: Number(e.target.value) })} className={inputClass} /></Field><Field label="Timezone"><input value={settings.timezone} onChange={(e) => setSettings({ ...settings, timezone: e.target.value })} className={inputClass} /></Field></div>
        </Section>

        <Section title="Aktivitas & fitness"><div className="grid grid-cols-2 gap-3"><Field label="VO₂ max"><input type="number" step="0.1" value={settings.vo2Max ?? ""} onChange={(e) => setSettings({ ...settings, vo2Max: e.target.value ? Number(e.target.value) : null })} placeholder="Opsional" className={inputClass} /></Field><Field label="Resting HR"><input type="number" value={settings.restingHeartRate ?? ""} onChange={(e) => setSettings({ ...settings, restingHeartRate: e.target.value ? Number(e.target.value) : null })} placeholder="bpm" className={inputClass} /></Field><Field label="Kardio / minggu"><input type="number" value={settings.cardioMinutesWeekly} onChange={(e) => setSettings({ ...settings, cardioMinutesWeekly: Number(e.target.value) })} className={inputClass} /></Field><Field label="Strength days"><input type="number" min="0" max="7" value={settings.strengthDaysWeekly} onChange={(e) => setSettings({ ...settings, strengthDaysWeekly: Number(e.target.value) })} className={inputClass} /></Field></div></Section>

        <button type="submit" disabled={saving} className="w-full rounded-xl bg-brand-600 py-3 font-medium text-white disabled:opacity-50">{saving ? "Menyimpan..." : saved ? "Tersimpan ✓" : "Simpan Program"}</button>
      </form>

      <Section title="Integrasi"><p className="text-sm text-neutral-500">Active Energy sudah bisa dikirim melalui Apple Shortcuts. Data tubuh dan fitness lain akan disambungkan pada Health Sync V2.</p></Section>
      <Section title="Akun"><button onClick={logout} className="w-full rounded-xl border border-red-300 py-3 font-medium text-red-500 dark:border-red-900">Keluar</button></Section>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900"><div className="mb-3"><h2 className="text-sm font-semibold">{title}</h2>{description && <p className="mt-0.5 text-xs text-neutral-400">{description}</p>}</div>{children}</section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-sm text-neutral-500">{label}</span>{children}</label>; }
function Stat({ label, value, note }: { label: string; value: string; note: string }) { return <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800"><div className="text-xs text-neutral-500">{label}</div><div className="mt-1 font-bold tabular-nums">{value}</div><div className="text-xs text-neutral-400">{note}</div></div>; }
