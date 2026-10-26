"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ActivityLevel, BiologicalSex, FitnessGoal, UserSettings } from "@/lib/types";
import { computeProgramRecommendation, type ProgramRecommendation } from "@/lib/programCalories";
import DisplaySettings from "@/components/DisplaySettings";
import { programDraftError } from "@/lib/programDraft";

const GOALS: { value: FitnessGoal; label: string; description: string }[] = [
  { value: "weight_loss", label: "Turun berat", description: "Turun berat dengan defisit moderat." },
  { value: "very_lean", label: "Lebih ramping", description: "Defisit lebih konservatif sambil menjaga otot." },
  { value: "athletic", label: "Jaga performa", description: "Mulai dari maintenance dan fokus performa." },
  { value: "muscle_gain", label: "Tambah otot", description: "Surplus kecil dan terkontrol." },
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
  const [showRecommendation, setShowRecommendation] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [userName, setUserName] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/settings");
      if (!response.ok) throw new Error("Profil belum dapat dimuat. Coba lagi ya.");
      const data: SettingsResponse = await response.json();
      setSettings(data.settings);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Profil belum dapat dimuat."); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void load();
    fetch("/api/me").then((r) => r.ok ? r.json() : null).then((d) => setUserName(d?.name ?? "")).catch(() => {});
  }, []);
  const validationError = settings ? programDraftError(settings) : null;
  const recommendation = settings && !validationError ? computeProgramRecommendation(settings) : null;

  async function persist(applyRecommendation = false) {
    if (!settings) return;
    const invalid = programDraftError(settings);
    if (invalid) { setError(invalid); return; }
    setSaving(true); setSaved(false); setError("");
    try {
      const res = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, applyRecommendation }) });
      if (!res.ok) throw new Error("Program belum tersimpan. Isianmu tetap ada; coba lagi.");
      const data: SettingsResponse = await res.json();
      setSettings(data.settings); setSaved(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Program belum tersimpan. Isianmu tetap ada.");
    } finally { setSaving(false); }
  }

  async function save(e: React.FormEvent) { e.preventDefault(); await persist(false); }
  async function logout() {
    try {
      const response = await fetch("/api/auth", { method: "DELETE" });
      if (!response.ok) throw new Error("Belum dapat keluar. Coba lagi.");
      router.replace("/login");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Belum dapat keluar."); }
  }

  if (!settings) return <div className="space-y-3 p-6">{loading ? <p className="text-neutral-500">Memuat profil…</p> : <><p role="alert" className="text-sm text-red-600">{error}</p><button type="button" onClick={() => void load()} className="rounded-xl bg-brand-700 px-4 py-3 font-medium text-white">Coba lagi</button></>}</div>;
  const inputClass = "w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800";

  return (
    <div className="space-y-4 p-4">
      <header className="pt-2"><h1 className="text-xl font-bold">Program Saya</h1>{userName && <p className="text-sm text-neutral-500">Masuk sebagai {userName}</p>}</header>
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950 dark:text-red-200">{error}</p>}
      {saved && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-950 dark:text-brand-200">Program tersimpan.</p>}

      {!settings.programConfigured && <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm dark:border-amber-900 dark:bg-amber-950/30"><div className="font-semibold">Lengkapi profil program</div><p className="mt-1 text-neutral-600 dark:text-neutral-300">Angka 1.800 kcal dan 120 g protein saat ini masih nilai awal, bukan rekomendasi personal.</p></section>}

      <form onSubmit={save} onChange={() => { setSaved(false); setError(""); }} className="space-y-4">
        <Section title="Nama panggilan" description="Dipakai untuk sapaan di Home.">
          <input value={settings.displayName ?? ""} maxLength={30} onChange={(e) => setSettings({ ...settings, displayName: e.target.value })} placeholder="nama panggilan" className={inputClass} />
        </Section>

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

        <button type="button" onClick={() => { setShowRecommendation(true); setSaved(false); }} className="w-full rounded-xl border border-brand-500 py-3 font-medium text-brand-700 dark:text-brand-300">Lihat rekomendasi dari isian ini</button>
        <p className="text-center text-xs text-neutral-500">Melihat rekomendasi tidak menyimpan atau mengubah target aktif.</p>

        {showRecommendation && validationError && <p role="alert" className="text-sm text-red-600 dark:text-red-300">{validationError}</p>}
        {showRecommendation && !validationError && !recommendation?.complete && <p role="status" className="text-sm text-neutral-500">Lengkapi usia, jenis kelamin, tinggi, dan aktivitas agar rekomendasi bisa dihitung.</p>}
        {showRecommendation && recommendation?.complete && <Section title="Rekomendasi program" description="Estimasi awal berdasarkan isianmu. Angka dibulatkan agar praktis digunakan.">
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

      <Section title="Data kesehatan" description="Masukkan hasil pengukuran dari Apple Health lewat Shortcut di iPhone.">
        <p className="text-sm text-neutral-500">Hubungkan berat badan dan persentase lemak, lalu periksa kapan data terakhir masuk.</p>
        <Link href="/settings/health" className="mt-3 inline-flex rounded-xl bg-brand-700 px-4 py-3 text-sm font-medium text-white">Hubungkan Apple Health →</Link>
      </Section>
      <Section title="Tampilan" description="Otomatis mengikuti pengaturan HP-mu."><DisplaySettings /></Section>
      <Section title="Akun">
        <div className="space-y-2">
          <button onClick={() => router.push("/account/set-pin")} className="w-full rounded-xl border border-neutral-300 py-3 font-medium text-neutral-700 dark:border-neutral-700 dark:text-neutral-200">Ubah PIN</button>
          <button onClick={logout} className="w-full rounded-xl border border-red-300 py-3 font-medium text-red-500 dark:border-red-900">Keluar</button>
        </div>
      </Section>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) { return <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-xs dark:border-neutral-800 dark:bg-neutral-900"><div className="mb-3"><h2 className="text-sm font-semibold">{title}</h2>{description && <p className="mt-0.5 text-xs text-neutral-400">{description}</p>}</div>{children}</section>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block"><span className="mb-1 block text-sm text-neutral-500">{label}</span>{children}</label>; }
function Stat({ label, value, note }: { label: string; value: string; note: string }) { return <div className="rounded-xl bg-neutral-50 p-3 dark:bg-neutral-800"><div className="text-xs text-neutral-500">{label}</div><div className="mt-1 font-bold tabular-nums">{value}</div><div className="text-xs text-neutral-400">{note}</div></div>; }
