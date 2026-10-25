"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Mascot from "@/components/Mascot";
import { computeProgramRecommendation } from "@/lib/programCalories";
import {
  DEFAULT_SETTINGS,
  type ActivityLevel,
  type BiologicalSex,
  type FitnessGoal,
  type UserSettings,
} from "@/lib/types";

const GOALS: { value: FitnessGoal; label: string; hint: string }[] = [
  { value: "weight_loss", label: "Turun berat badan", hint: "Defisit moderat, ritme yang bisa dijalani." },
  { value: "very_lean", label: "Lebih ramping, otot tetap terjaga", hint: "Defisit lebih ringan, protein lebih tinggi." },
  { value: "athletic", label: "Jaga bentuk badan dan performa", hint: "Mulai dari kalori maintenance." },
  { value: "muscle_gain", label: "Tambah otot", hint: "Surplus kecil dan terkontrol." },
];

const ACTIVITIES: { value: ActivityLevel; label: string; hint: string }[] = [
  { value: "sedentary", label: "Santai", hint: "Mayoritas duduk, hampir tidak berolahraga." },
  { value: "light", label: "Ringan", hint: "Aktif ringan atau olahraga 1–3 hari per minggu." },
  { value: "moderate", label: "Sedang", hint: "Olahraga 3–5 hari per minggu." },
  { value: "very_active", label: "Sangat aktif", hint: "Latihan berat atau pekerjaan fisik." },
];

const STEPS = 4;

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState<FitnessGoal>("weight_loss");
  const [sex, setSex] = useState<BiologicalSex | null>(null);
  const [age, setAge] = useState("");
  const [height, setHeight] = useState("");
  const [weight, setWeight] = useState("");
  const [goalWeight, setGoalWeight] = useState("");
  const [waist, setWaist] = useState("");
  const [activity, setActivity] = useState<ActivityLevel | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        // Slots without USERn_NAME come back as "User 3"; don't pre-fill that.
        if (d?.name && !/^User \d$/.test(d.name)) setName((current) => current || d.name);
      })
      .catch(() => {});
  }, []);

  const ageN = Number(age);
  const heightN = Number(height);
  const weightN = Number(weight);
  const goalWeightN = Number(goalWeight);
  const bodyValid =
    sex !== null &&
    ageN >= 18 && ageN <= 100 &&
    heightN >= 120 && heightN <= 230 &&
    weightN >= 30 && weightN <= 300 &&
    goalWeightN >= 30 && goalWeightN <= 300;

  const draft: UserSettings = {
    ...DEFAULT_SETTINGS,
    displayName: name.trim() || null,
    fitnessGoal: goal,
    biologicalSex: sex,
    age: ageN || null,
    heightCm: heightN || null,
    weightKg: weightN || DEFAULT_SETTINGS.weightKg,
    goalWeightKg: goalWeightN || DEFAULT_SETTINGS.goalWeightKg,
    activityLevel: activity,
  };
  const rec = computeProgramRecommendation(draft);

  async function finish() {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...draft, applyRecommendation: true }),
      });
      if (!res.ok) throw new Error("Belum tersimpan. Coba lagi ya.");
      await fetch("/api/weight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weightKg: weightN }),
      });
      const waistN = Number(waist);
      if (waist && waistN >= 30 && waistN <= 200) {
        await fetch("/api/body", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ waistCm: waistN }),
        }).catch(() => {});
      }
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Belum bisa menyimpan.");
      setSaving(false);
    }
  }

  const inputClass =
    "w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-lg outline-hidden focus:border-brand-500 dark:border-neutral-800 dark:bg-neutral-900";
  const optionClass = (active: boolean) =>
    `w-full rounded-2xl border p-4 text-left transition-colors ${
      active
        ? "border-brand-500 bg-brand-50 dark:bg-brand-900/20"
        : "border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
    }`;

  return (
    <div className="flex min-h-screen flex-col bg-neutral-50 px-5 pb-8 pt-8 dark:bg-neutral-950">
      <div className="mb-6 flex items-center gap-3">
        <Mascot mood={step === STEPS ? "cheer" : "happy"} className="h-14 w-14 shrink-0" />
        <div className="flex-1">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
            <div
              className="h-full rounded-full bg-brand-500 transition-all duration-500"
              style={{ width: `${(step / STEPS) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-neutral-400">
            {step === 0 ? "Mulai" : `Langkah ${Math.min(step, STEPS)} dari ${STEPS}`}
          </p>
        </div>
      </div>

      <div className="flex-1">
        {step === 0 && (
          <div className="space-y-3">
            <h1 className="text-2xl font-bold">Halo! Kita atur targetmu dulu.</h1>
            <p className="text-neutral-500">
              Cuma empat pertanyaan singkat, lalu aku hitung berapa kalori dan protein yang pas buatmu.
              Angkanya baru titik awal. Setelah beberapa minggu, aku sesuaikan dari catatan nyatamu.
            </p>
            <label className="block pt-2">
              <span className="mb-1 block text-sm text-neutral-500">Biar akrab, aku panggil kamu siapa?</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={30}
                autoComplete="given-name"
                placeholder="nama panggilan"
                className={inputClass}
              />
            </label>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <h1 className="text-xl font-bold">Apa tujuan utamamu?</h1>
            {GOALS.map((g) => (
              <button key={g.value} type="button" onClick={() => setGoal(g.value)} className={optionClass(goal === g.value)}>
                <div className="font-medium">{g.label}</div>
                <div className="text-sm text-neutral-500">{g.hint}</div>
              </button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Data tubuhmu</h1>
            <div className="grid grid-cols-2 gap-2">
              {([["male", "Laki-laki"], ["female", "Perempuan"]] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => setSex(value)} className={optionClass(sex === value)}>
                  <div className="text-center font-medium">{label}</div>
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="mb-1 block text-sm text-neutral-500">Usia</span>
                <input inputMode="numeric" value={age} onChange={(e) => setAge(e.target.value)} placeholder="tahun" className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-neutral-500">Tinggi</span>
                <input inputMode="numeric" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="cm" className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-neutral-500">Berat sekarang</span>
                <input inputMode="decimal" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="kg" className={inputClass} />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-neutral-500">Berat target</span>
                <input inputMode="decimal" value={goalWeight} onChange={(e) => setGoalWeight(e.target.value)} placeholder="kg" className={inputClass} />
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm text-neutral-500">Lingkar pinggang (opsional)</span>
              <input inputMode="decimal" value={waist} onChange={(e) => setWaist(e.target.value)} placeholder="cm, ukur setinggi pusar" className={inputClass} />
            </label>
            <p className="text-xs text-neutral-400">
              Nggak wajib dan nggak dipakai buat menghitung target. Ini jadi titik awal buat melihat perubahan tubuhmu, selain angka timbangan.
            </p>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <h1 className="text-xl font-bold">Seaktif apa minggu normalmu?</h1>
            <p className="text-sm text-neutral-500">Pilih yang paling mirip minggu biasamu, bukan minggu paling rajin.</p>
            {ACTIVITIES.map((a) => (
              <button key={a.value} type="button" onClick={() => setActivity(a.value)} className={optionClass(activity === a.value)}>
                <div className="font-medium">{a.label}</div>
                <div className="text-sm text-neutral-500">{a.hint}</div>
              </button>
            ))}
          </div>
        )}

        {step === STEPS && (
          <div className="space-y-4">
            <h1 className="text-xl font-bold">Ini titik awalmu</h1>
            <div className="rounded-3xl bg-linear-to-br from-brand-600 to-brand-800 p-5 text-white">
              <div className="text-sm text-brand-100">Target makan per hari</div>
              <div className="text-4xl font-extrabold tabular-nums">{rec.recommendedCalories} kcal</div>
              <div className="mt-3 grid grid-cols-2 gap-3 border-t border-white/20 pt-3 text-sm">
                <div>
                  <div className="font-semibold tabular-nums">{rec.recommendedProteinG} g</div>
                  <div className="text-brand-100">protein</div>
                </div>
                <div>
                  <div className="font-semibold tabular-nums">{rec.maintenanceCalories} kcal</div>
                  <div className="text-brand-100">maintenance</div>
                </div>
              </div>
            </div>
            <ul className="space-y-1 text-xs text-neutral-500">
              {rec.notes.map((note, i) => (
                <li key={i}>• {note}</li>
              ))}
            </ul>
            {error && <p role="alert" className="text-sm text-red-500">{error}</p>}
          </div>
        )}
      </div>

      <div className="mt-6 flex gap-3">
        {step > 0 && (
          <button
            type="button"
            onClick={() => setStep(step - 1)}
            disabled={saving}
            className="rounded-2xl border border-neutral-300 px-5 py-3.5 font-medium dark:border-neutral-700"
          >
            Kembali
          </button>
        )}
        {step < STEPS ? (
          <button
            type="button"
            onClick={() => setStep(step + 1)}
            disabled={(step === 0 && !name.trim()) || (step === 2 && !bodyValid) || (step === 3 && activity === null)}
            className="flex-1 rounded-2xl bg-brand-600 py-3.5 font-semibold text-white disabled:opacity-40"
          >
            {step === 0 ? "Mulai" : "Lanjut"}
          </button>
        ) : (
          <button
            type="button"
            onClick={finish}
            disabled={saving || !rec.complete}
            className="flex-1 rounded-2xl bg-brand-600 py-3.5 font-semibold text-white disabled:opacity-40"
          >
            {saving ? "Menyimpan..." : "Pakai target ini dan mulai"}
          </button>
        )}
      </div>
    </div>
  );
}
