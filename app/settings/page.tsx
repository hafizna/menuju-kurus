"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { UserSettings } from "@/lib/types";

export default function SettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d) => setSettings(d.settings));
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

  return (
    <div className="space-y-4 p-4">
      <h1 className="pt-2 text-xl font-bold">⚙️ Pengaturan</h1>

      <form onSubmit={save} className="space-y-4 rounded-2xl bg-white p-4 shadow-sm dark:bg-neutral-900">
        <div>
          <label className="mb-1 block text-sm text-neutral-500">Target kalori harian (kcal)</label>
          <input
            type="number"
            value={settings.dailyTargetKcal}
            onChange={(e) => setSettings({ ...settings, dailyTargetKcal: Number(e.target.value) })}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-500">Berat badan (kg)</label>
          <input
            type="number"
            value={settings.weightKg}
            onChange={(e) => setSettings({ ...settings, weightKg: Number(e.target.value) })}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
          />
          <p className="mt-1 text-xs text-neutral-400">Dipakai untuk hitung kalori olahraga penebus.</p>
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-500">Panjang window puasa (jam)</label>
          <input
            type="number"
            value={settings.ifWindowHours}
            onChange={(e) => setSettings({ ...settings, ifWindowHours: Number(e.target.value) })}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm text-neutral-500">Timezone</label>
          <input
            value={settings.timezone}
            onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
            className="w-full rounded-lg border border-neutral-300 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full rounded-xl bg-brand-600 py-3 font-medium text-white disabled:opacity-50"
        >
          {saving ? "Menyimpan..." : saved ? "Tersimpan ✓" : "Simpan"}
        </button>
      </form>

      <section className="rounded-2xl bg-white p-4 text-sm text-neutral-500 shadow-sm dark:bg-neutral-900">
        <div className="mb-1 font-medium text-neutral-700 dark:text-neutral-300">Sinkron kalori keluar otomatis</div>
        Set up Apple Shortcuts automation untuk kirim Active Energy dari Health app ke <code>/api/health-sync</code>{" "}
        — lihat README di repo untuk langkah lengkap.
      </section>

      <button
        onClick={logout}
        className="w-full rounded-xl border border-red-300 py-3 font-medium text-red-500 dark:border-red-900"
      >
        Keluar
      </button>
    </div>
  );
}
