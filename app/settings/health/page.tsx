"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type ConnectionState = {
  configured: boolean;
  legacy: boolean;
  createdAt: string | null;
  lastTestAt: string | null;
  lastSync: { receivedAt: string; provider: string; dates: string[]; fields: string[] } | null;
};

const shortcutName = "Slothly Health Sync";
const runShortcut = `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName)}`;
const connectShortcut = `${runShortcut}&input=clipboard`;
const fieldLabels: Record<string, string> = {
  weightKg: "Berat badan", bodyFatPercent: "Persentase lemak", calories: "Energi aktif",
  vo2Max: "VO₂ max", restingHeartRate: "Detak jantung istirahat", cardioMinutesWeekly: "Durasi kardio",
};

function timestamp(value: string) {
  return new Date(value).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" });
}

function measurementDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("id-ID", { dateStyle: "medium" });
}

const card = "rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900";
const primary = "inline-flex min-h-11 items-center justify-center rounded-xl bg-brand-700 px-4 py-3 text-center text-sm font-medium text-white disabled:opacity-50";
const secondary = "inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 px-4 py-3 text-center text-sm font-medium disabled:opacity-50 dark:border-neutral-700";

export default function HealthConnectionPage() {
  const [state, setState] = useState<ConnectionState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [origin, setOrigin] = useState("");
  const [message, setMessage] = useState("");
  const alive = useRef(true);
  const mutationVersion = useRef(0);
  const mutating = useRef(false);

  const load = useCallback(async (silent = false) => {
    if (mutating.current) return;
    const version = mutationVersion.current;
    if (!silent) { setLoading(true); setError(""); }
    try {
      const response = await fetch("/api/health-connection", { cache: "no-store" });
      if (!response.ok) throw new Error("Status koneksi belum dapat dimuat. Coba lagi.");
      const data: ConnectionState = await response.json();
      if (alive.current && version === mutationVersion.current && !mutating.current) setState(data);
    } catch (cause) {
      if (alive.current && !silent) setError(cause instanceof Error ? cause.message : "Status koneksi belum dapat dimuat.");
    } finally { if (alive.current && !silent) setLoading(false); }
  }, []);

  useEffect(() => {
    alive.current = true;
    setOrigin(window.location.origin);
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(true); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 15_000);
    return () => {
      alive.current = false;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  async function createConnection() {
    if (busy) return;
    mutationVersion.current++; mutating.current = true;
    setBusy(true); setError(""); setMessage(""); setToken(""); setCopied(false); setShowConfig(false);
    try {
      const response = await fetch("/api/health-connection", { method: "POST" });
      if (!response.ok) throw new Error("Koneksi belum dapat disiapkan. Coba lagi.");
      const data: ConnectionState & { token: string } = await response.json();
      if (!data.token) throw new Error("Konfigurasi belum diterima. Coba lagi.");
      setState(data); setToken(data.token);
      setMessage("Koneksi siap disambungkan. Ikuti tiga langkah di bawah.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Koneksi belum dapat disiapkan."); }
    finally { mutating.current = false; setBusy(false); }
  }

  async function disconnect() {
    if (busy) return;
    mutationVersion.current++; mutating.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      const response = await fetch("/api/health-connection", { method: "DELETE" });
      if (!response.ok) throw new Error("Koneksi belum dapat diputus. Coba lagi.");
      const data: ConnectionState = await response.json();
      setState(data);
      setToken(""); setCopied(false); setShowConfig(false);
      setMessage("Koneksi diputus. Hasil pengukuran yang sudah masuk tetap tersimpan.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Koneksi belum dapat diputus."); }
    finally { mutating.current = false; setBusy(false); }
  }

  const configuration = token && origin ? JSON.stringify({ endpoint: `${origin}/api/health-sync`, token }) : "";
  async function copyConfiguration() {
    setError("");
    try {
      await navigator.clipboard.writeText(configuration);
      setCopied(true); setMessage("Konfigurasi disalin. Buka Shortcut untuk menyambungkannya.");
    } catch {
      setShowConfig(true);
      setMessage("Pilih dan salin konfigurasi di bawah, lalu buka Shortcut.");
    }
  }

  const connected = state?.configured;
  const currentReceipt = state?.lastSync && (!state.createdAt || Date.parse(state.lastSync.receivedAt) >= Date.parse(state.createdAt));
  const title = !connected ? "Belum terhubung" : currentReceipt ? "Data sudah diterima" : "Menunggu data pertama";

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-8">
      <Link href="/settings" className="inline-flex min-h-11 items-center text-sm text-neutral-500">← Kembali ke Profil</Link>
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-brand-700 dark:text-brand-300">Data kesehatan · iPhone</p>
        <h1 className="mt-1 text-2xl font-bold">Hubungkan Apple Health</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">Ambil berat badan dan persentase lemak dari Apple Health melalui Shortcut di iPhone. Kamu memilih izin saat Shortcut dijalankan.</p>
      </header>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-950 dark:text-brand-200">{message}</p>}

      <section className={card} aria-label="Status sinkronisasi">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{loading && !state ? "Memuat status…" : title}</h2>
            {state && !connected && <p className="mt-1 text-sm text-neutral-500">Pasang Shortcut di iPhone terlebih dahulu, lalu siapkan koneksinya di sini.</p>}
            {connected && !currentReceipt && <p className="mt-1 text-sm text-neutral-500">Status berubah setelah pengukuran benar-benar masuk.</p>}
          </div>
          <button type="button" onClick={() => void load()} disabled={loading || busy} className="min-h-11 text-sm font-medium text-brand-700 disabled:opacity-50 dark:text-brand-300">{loading ? "Memeriksa…" : "Periksa status"}</button>
        </div>
        {connected && state?.lastTestAt && <p className="mt-3 text-xs text-neutral-500">Koneksi diuji: {timestamp(state.lastTestAt)}</p>}
        {state?.lastSync && (
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="text-neutral-500">{connected && currentReceipt ? "Data terakhir diterima" : "Data dari koneksi sebelumnya"}</dt><dd>{timestamp(state.lastSync.receivedAt)}</dd></div>
            <div><dt className="text-neutral-500">Tanggal pengukuran</dt><dd>{state.lastSync.dates.map(measurementDate).join(", ")}</dd></div>
            <div><dt className="text-neutral-500">Data yang masuk</dt><dd>{state.lastSync.fields.map(field => fieldLabels[field] ?? field).join(", ")}</dd></div>
          </dl>
        )}
        {!connected && <div className="mt-4 flex flex-wrap gap-2"><a href="/shortcuts/slothly-health-sync.shortcut" className={secondary}>Pasang Shortcut</a><button type="button" onClick={() => void createConnection()} disabled={loading || busy} className={primary}>{busy ? "Menyiapkan…" : "Siapkan koneksi"}</button></div>}
        {connected && !token && (
          <div className="mt-4 flex flex-wrap gap-2">
            <a href={runShortcut} className={primary}>Sinkronkan sekarang</a>
            <a href="/shortcuts/slothly-health-sync.shortcut" className={secondary}>Pasang Shortcut</a>
          </div>
        )}
      </section>

      {token && (
        <section className={`${card} space-y-5`} aria-label="Pemasangan Shortcut">
          <h2 className="font-semibold">Sambungkan sekali di iPhone</h2>
          <div>
            <h3 className="text-sm font-medium">1. Pasang Shortcut</h3>
            <p className="mt-1 text-sm text-neutral-500">Unduh, buka file di iPhone, lalu pilih Tambah Shortcut. Nama Shortcut harus tetap “{shortcutName}”.</p>
            <a href="/shortcuts/slothly-health-sync.shortcut" className={`${secondary} mt-3`}>Pasang Shortcut</a>
          </div>
          <div>
            <h3 className="text-sm font-medium">2. Salin konfigurasi pribadimu</h3>
            <p className="mt-1 text-sm text-neutral-500">Konfigurasi ini mengizinkan Shortcut mengirim data ke akunmu. Simpan untuk dirimu sendiri.</p>
            <button type="button" onClick={() => void copyConfiguration()} className={`${secondary} mt-3`}>{copied ? "Disalin ✓" : "Salin konfigurasi"}</button>
            {showConfig && <textarea aria-label="Konfigurasi koneksi pribadi" readOnly value={configuration} onCopy={() => setCopied(true)} onFocus={event => event.target.select()} className="mt-3 min-h-28 w-full rounded-xl border border-neutral-300 p-3 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-800" />}
          </div>
          <div>
            <h3 className="text-sm font-medium">3. Buka Shortcut dan beri izin</h3>
            <p className="mt-1 text-sm text-neutral-500">Izinkan membaca clipboard untuk memasang konfigurasi, lalu pilih akses berat badan dan persentase lemak di Apple Health. Setelah selesai, kembali ke halaman ini.</p>
            {copied ? <a href={connectShortcut} className={`${primary} mt-3`}>Buka Shortcut</a> : <button type="button" disabled className={`${primary} mt-3`}>Salin konfigurasi lebih dulu</button>}
          </div>
          <p className="border-t border-neutral-200 pt-3 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800">Jika kamu meninggalkan halaman sebelum menyalin konfigurasi, pilih Sambungkan ulang untuk membuat konfigurasi baru.</p>
        </section>
      )}

      <section className={card}>
        <h2 className="font-semibold">Setelah tersambung</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">Jalankan “{shortcutName}” setelah menimbang, atau tambahkan ke Automasi di aplikasi Shortcuts. Slothly menyimpan tanggal pengukuran asli. Berat dan persentase lemak boleh masuk terpisah.</p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">Belum ada data? Pastikan berat badan atau persentase lemak sudah terlihat di Apple Health dan izin membaca untuk Shortcut sudah diberikan.</p>
      </section>

      {connected && (
        <details className={card}>
          <summary className="cursor-pointer text-sm font-medium">Kelola koneksi</summary>
          <p className="mt-3 text-sm text-neutral-500">Sambungkan ulang jika konfigurasi hilang atau ingin mengganti akses Shortcut sebelumnya.</p>
          {state?.legacy && <p className="mt-2 text-xs text-neutral-500">Shortcut lama masih dapat dipakai. Menyambungkan ulang akan mengganti aksesnya.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void createConnection()} disabled={busy} className={secondary}>{busy ? "Memproses…" : "Sambungkan ulang"}</button>
            <button type="button" onClick={() => void disconnect()} disabled={busy} className="min-h-11 rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-300">Putuskan koneksi</button>
          </div>
        </details>
      )}

      <p className="px-1 text-xs leading-relaxed text-neutral-500">Health Connect untuk Android belum tersedia di versi ini.</p>
    </div>
  );
}
