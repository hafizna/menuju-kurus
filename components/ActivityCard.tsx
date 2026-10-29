"use client";

import { useState, type FormEvent } from "react";
import type { BurnEntry } from "@/lib/types";
import {
  ACTIVITY_DURATIONS, ACTIVITY_KINDS, MAX_ACTIVITY_KCAL, MAX_ACTIVITY_MINUTES,
  activityKind, describeActivity, estimateActivityKcal, validDurationMin,
} from "@/lib/activity";

const chip = "flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-neutral-300 px-3 text-sm transition-colors peer-checked:border-brand-600 peer-checked:bg-brand-600 peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-brand-500 peer-focus-visible:ring-offset-2";
const field = "rounded-xl border border-neutral-300 bg-transparent px-3 py-2 text-sm";

interface Props {
  burns: BurnEntry[];
  /** Day being shown, used to delete an entry from the right log. */
  date: string;
  weightKg: number;
  /** Reloads the day after a save or delete; resolves false when that failed. */
  onChanged: () => Promise<boolean>;
}

export default function ActivityCard({ burns, date, weightKg, onChanged }: Props) {
  const [kind, setKind] = useState("");
  const [preset, setPreset] = useState<number | null>(null);
  const [custom, setCustom] = useState("");
  const [kcalInput, setKcalInput] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const typed = custom.trim();
  const minutes = typed ? (/^\d{1,3}$/.test(typed) ? Number(typed) : NaN) : preset;
  const minutesOk = minutes !== null && validDurationMin(minutes);
  const estimate = kind && minutesOk ? estimateActivityKcal(kind, minutes, weightKg) : null;
  const kcalText = kcalInput ?? (estimate === null ? "" : String(estimate));
  const kcal = /^\d{1,4}$/.test(kcalText.trim()) ? Number(kcalText.trim()) : NaN;
  const ready = Boolean(kind) && minutesOk && kcal > 0 && kcal <= MAX_ACTIVITY_KCAL;
  const synced = burns.filter(burn => burn.source === "shortcuts");

  async function save(event: FormEvent) {
    event.preventDefault();
    const chosen = activityKind(kind);
    if (!chosen || !minutesOk || saving) return;
    if (!(kcal > 0 && kcal <= MAX_ACTIVITY_KCAL)) { setError(`Isi estimasi antara 1 dan ${MAX_ACTIVITY_KCAL} kcal.`); return; }
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/log", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "burn", calories: kcal, label: chosen.label, kind: chosen.id, durationMin: minutes, source: "manual" }),
      });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "Belum tersimpan. Isianmu tetap di sini.");
      setKind(""); setPreset(null); setCustom(""); setKcalInput(null);
      setNotice(`Mantap, ${describeActivity(chosen.label, minutes).toLowerCase()} tercatat.`);
      if (!(await onChanged())) setError("Tersimpan, tapi ringkasan belum diperbarui. Muat ulang halaman.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Belum tersimpan. Coba lagi."); }
    finally { setSaving(false); }
  }

  async function remove(entry: BurnEntry) {
    if (removing) return;
    setRemoving(entry.id); setError(""); setNotice("");
    try {
      const response = await fetch(`/api/log?type=burn&id=${encodeURIComponent(entry.id)}&date=${date}`, { method: "DELETE" });
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "Belum terhapus. Coba lagi.");
      if (!(await onChanged())) setError("Terhapus, tapi ringkasan belum diperbarui. Muat ulang halaman.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Belum terhapus. Coba lagi."); }
    finally { setRemoving(null); }
  }

  return (
    <section className="home-card rounded-2xl border border-neutral-200/70 bg-white p-4" aria-labelledby="activity-title">
      <h2 id="activity-title" className="font-semibold">Gerak hari ini</h2>
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">Apa pun yang bikin badan bergerak. Hanya catatan, tidak menambah jatah makan.</p>

      {burns.length > 0 && (
        <ul className="mt-3 divide-y divide-neutral-100" aria-label="Aktivitas tercatat hari ini">
          {burns.map(entry => (
            <li key={entry.id} className="flex items-center justify-between gap-2 py-2 text-sm">
              <span className="min-w-0 break-words">{entry.source === "shortcuts" ? "Apple Watch" : describeActivity(entry.label, entry.durationMin)}</span>
              <span className="flex shrink-0 items-center gap-1">
                <span className="tabular-nums text-neutral-600">{entry.calories} kcal</span>
                {entry.source === "manual" && <button type="button" onClick={() => void remove(entry)} disabled={Boolean(removing)} aria-label={`Hapus ${describeActivity(entry.label, entry.durationMin)}`} className="flex h-9 w-9 items-center justify-center rounded-lg text-neutral-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">{removing === entry.id ? "…" : "✕"}</button>}
              </span>
            </li>
          ))}
        </ul>
      )}
      {synced.length > 0 && <p className="mt-2 text-xs leading-relaxed text-neutral-500">Apple Watch sudah mengirim angka hari ini. Catatan manual tetap boleh, tetapi ringkasan mingguan memakai angka Apple Watch agar tidak dihitung ganda.</p>}

      <form onSubmit={save} className="mt-4 space-y-3.5" aria-label="Catat gerak">
        <fieldset>
          <legend className="text-sm font-semibold">Apa yang kamu lakukan?</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {ACTIVITY_KINDS.map(option => (
              <label key={option.id} className="relative">
                <input type="radio" name="activity-kind" value={option.id} checked={kind === option.id} onChange={() => { setKind(option.id); setKcalInput(null); }} className="peer sr-only" />
                <span className={chip}><span aria-hidden="true">{option.emoji}</span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold">Berapa lama?</legend>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {ACTIVITY_DURATIONS.map(option => (
              <label key={option} className="relative">
                <input type="radio" name="activity-duration" value={option} checked={!typed && preset === option} onChange={() => { setPreset(option); setCustom(""); setKcalInput(null); }} className="peer sr-only" />
                <span className={chip}>{option} mnt</span>
              </label>
            ))}
            <label className="flex items-center gap-1.5 text-sm text-neutral-500">
              <span className="sr-only">Atau isi sendiri, dalam menit</span>
              <input value={custom} onChange={event => { setCustom(event.target.value); setPreset(null); setKcalInput(null); }} inputMode="numeric" placeholder="Lain" aria-invalid={Boolean(typed) && !minutesOk} className={`${field} w-20 min-h-10 text-center`} />
              <span aria-hidden="true">mnt</span>
            </label>
          </div>
          {Boolean(typed) && !minutesOk && <p className="mt-1 text-xs text-red-600">Isi 1 sampai {MAX_ACTIVITY_MINUTES} menit.</p>}
        </fieldset>

        <div>
          <label htmlFor="activity-kcal" className="text-sm font-semibold">Perkiraan energi</label>
          <div className="mt-2 flex items-center gap-2">
            <input id="activity-kcal" value={kcalText} onChange={event => setKcalInput(event.target.value)} inputMode="numeric" placeholder="otomatis" aria-describedby="activity-kcal-hint" className={`${field} w-28 min-h-10 tabular-nums`} />
            <span className="text-sm text-neutral-500">kcal</span>
          </div>
          <p id="activity-kcal-hint" className="mt-1 text-xs leading-relaxed text-neutral-500">Dihitung kasar dari jenis, lama, dan beratmu. Ganti kalau kamu punya angka dari jam tangan atau mesin.</p>
        </div>

        <button type="submit" disabled={!ready || saving} className="w-full rounded-xl bg-brand-600 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{saving ? "Menyimpan..." : "Simpan gerak"}</button>
        {!ready && !saving && <p className="-mt-2 text-center text-xs text-neutral-500">Pilih jenis dan lamanya dulu.</p>}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {notice && <p role="status" className="text-sm text-brand-700">{notice}</p>}
      </form>
    </section>
  );
}
