"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconActivity, IconScaleWeight } from "@/components/icons";

type ConnectionState = {
  configured: boolean;
  legacy: boolean;
  createdAt: string | null;
  lastTestAt: string | null;
  lastSync: { receivedAt: string; provider: string; dates: string[]; fields: string[] } | null;
};

const shortcuts = [
  { id: "weight", name: "Slothly Berat", download: "/shortcuts/Slothly%20Berat.shortcut?v=1", icon: IconScaleWeight, description: "Berat badan dan persentase lemak yang tersedia di Apple Health hari ini." },
  { id: "watch", name: "Slothly Watch", download: "/shortcuts/Slothly%20Watch.shortcut?v=1", icon: IconActivity, description: "VO₂ max, detak jantung istirahat, dan jumlah kalori aktif hari ini dari Apple Health." },
] as const;
type ShortcutKind = (typeof shortcuts)[number]["id"];
const defaultShortcutNames = { weight: "Slothly Berat", watch: "Slothly Watch" };
const shortcutNamesKey = "mk_health_shortcut_names_v1";
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
  const [copying, setCopying] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [shortcutNames, setShortcutNames] = useState(defaultShortcutNames);
  const [origin, setOrigin] = useState("");
  const [message, setMessage] = useState("");
  const alive = useRef(true);
  const mutationVersion = useRef(0);
  const mutating = useRef(false);
  const copyAttempt = useRef(0);
  const configField = useRef<HTMLTextAreaElement>(null);

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
    try {
      const saved = JSON.parse(localStorage.getItem(shortcutNamesKey) || "{}");
      setShortcutNames({ weight: typeof saved.weight === "string" && saved.weight.trim() ? saved.weight.trim().slice(0, 80) : defaultShortcutNames.weight, watch: typeof saved.watch === "string" && saved.watch.trim() ? saved.watch.trim().slice(0, 80) : defaultShortcutNames.watch });
    } catch { /* Device storage is optional; the installed filename is the default. */ }
    void load();
    const refresh = () => { if (document.visibilityState === "visible") void load(true); };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(refresh, 15_000);
    return () => {
      alive.current = false;
      copyAttempt.current++;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load]);

  async function createConnection() {
    if (busy) return;
    mutationVersion.current++; mutating.current = true;
    copyAttempt.current++;
    setBusy(true); setError(""); setMessage(""); setToken(""); setCopied(false); setCopying(false); setShowConfig(false);
    try {
      const response = await fetch("/api/health-connection", { method: "POST" });
      if (!response.ok) throw new Error("Koneksi belum dapat disiapkan. Coba lagi.");
      const data: ConnectionState & { token: string } = await response.json();
      if (!data.token) throw new Error("Konfigurasi belum diterima. Coba lagi.");
      setState(data); setToken(data.token);
      setMessage("Koneksi siap. Salin konfigurasi, lalu tempel saat memasang Shortcut yang kamu butuhkan.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Koneksi belum dapat disiapkan."); }
    finally { mutating.current = false; setBusy(false); }
  }

  async function disconnect() {
    if (busy) return;
    mutationVersion.current++; mutating.current = true;
    copyAttempt.current++; setCopying(false);
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
  const runShortcut = (kind: ShortcutKind) => `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutNames[kind].trim() || defaultShortcutNames[kind])}`;

  function showManualCopy() {
    copyAttempt.current++;
    setCopying(false); setShowConfig(true);
    setMessage("Pilih teks konfigurasi, gunakan Salin dari menu iPhone, lalu tekan Sudah saya salin.");
  }

  function selectConfiguration() {
    const field = configField.current;
    if (!field) return;
    field.focus(); field.select(); field.setSelectionRange(0, field.value.length);
  }

  function confirmManualCopy() {
    copyAttempt.current++; setCopying(false); setCopied(true);
    setMessage("Konfigurasi siap ditempel saat pemasangan. Pilih Pasang Slothly Berat atau Pasang Slothly Watch di bawah.");
  }

  function changeShortcutName(kind: ShortcutKind, value: string) {
    const next = { ...shortcutNames, [kind]: value };
    setShortcutNames(next);
    try {
      localStorage.setItem(shortcutNamesKey, JSON.stringify({ ...next, [kind]: value.trim() || defaultShortcutNames[kind] }));
    } catch { /* The name still works for this visit if device storage is blocked. */ }
  }

  async function copyConfiguration() {
    if (!configuration || copying) return;
    const version = mutationVersion.current;
    const attempt = ++copyAttempt.current;
    const current = () => alive.current && version === mutationVersion.current && attempt === copyAttempt.current;
    let timeout: number | undefined;
    setError(""); setCopied(false); setCopying(true);
    setMessage("Menyalin konfigurasi… Pilihan Salin manual tetap dapat digunakan.");
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard unavailable");
      // Call during the tap itself: WebKit requires transient user activation.
      const write = navigator.clipboard.writeText(configuration);
      await Promise.race([write, new Promise<never>((_, reject) => {
        timeout = window.setTimeout(() => reject(new Error("Clipboard timed out")), 1500);
      })]);
      if (current()) { setCopied(true); setMessage("Konfigurasi disalin. Tempel pada pertanyaan pemasangan di masing-masing Shortcut."); }
    } catch {
      if (current()) {
        setShowConfig(true);
        setMessage("Browser belum menyalin konfigurasi. Gunakan pilihan Salin manual.");
      }
    } finally {
      if (timeout !== undefined) window.clearTimeout(timeout);
      if (current()) setCopying(false);
    }
  }

  const connected = state?.configured;
  const currentReceipt = state?.lastSync && (!state.createdAt || Date.parse(state.lastSync.receivedAt) >= Date.parse(state.createdAt));
  const verified = Boolean(state?.lastTestAt || currentReceipt);
  const title = !connected ? "Belum terhubung" : currentReceipt ? "Data sudah diterima" : verified ? "Koneksi diuji, data belum masuk" : "Selesaikan pemasangan";

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-8">
      <Link href="/settings" className="inline-flex min-h-11 items-center text-sm text-neutral-500">← Kembali ke Profil</Link>
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-brand-700 dark:text-brand-300">Data kesehatan · iPhone</p>
        <h1 className="mt-1 text-2xl font-bold">Hubungkan Apple Health</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">Dua Shortcut untuk menyalurkan pengukuran dari Apple Health ke Slothly. Pasang yang kamu butuhkan, jalankan sekali untuk memberi izin, lalu atur automasinya di iPhone.</p>
      </header>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-950 dark:text-brand-200">{message}</p>}

      <section className={card} aria-label="Status sinkronisasi">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{loading && !state ? "Memuat status…" : title}</h2>
            {state && !connected && <p className="mt-1 text-sm text-neutral-500">Siapkan koneksi, salin konfigurasinya, lalu tempel saat memasang masing-masing Shortcut.</p>}
            {connected && !currentReceipt && <p className="mt-1 text-sm text-neutral-500">{verified ? "Jalankan Shortcut yang sudah dipasang, lalu periksa status setelah selesai." : "Salin konfigurasi saat pemasangan, kemudian jalankan Shortcut sekali. Konfigurasi dipakai kembali untuk sinkronisasi berikutnya."}</p>}
          </div>
          <button type="button" onClick={() => void load()} disabled={loading || busy} className="min-h-11 text-sm font-medium text-brand-700 disabled:opacity-50 dark:text-brand-300">{loading ? "Memeriksa…" : "Periksa status"}</button>
        </div>
        {connected && state?.lastTestAt && <p className="mt-3 text-xs text-neutral-500">Koneksi diuji: {timestamp(state.lastTestAt)}</p>}
        {state?.lastSync && (
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="text-neutral-500">{connected && currentReceipt ? "Data terakhir diterima" : "Data dari koneksi sebelumnya"}</dt><dd>{timestamp(state.lastSync.receivedAt)}</dd></div>
            <div><dt className="text-neutral-500">Tanggal pengukuran</dt><dd>{state.lastSync.dates.map(measurementDate).join(", ")}</dd></div>
            <div><dt className="text-neutral-500">Data pada pengiriman terakhir</dt><dd>{state.lastSync.fields.map(field => fieldLabels[field] ?? field).join(", ")}</dd></div>
          </dl>
        )}
        {state?.lastSync && <p className="mt-3 text-xs leading-relaxed text-neutral-500">Setiap metrik dikirim terpisah. Lihat seluruh hasil di <Link href="/progress?tab=body" className="font-semibold text-brand-700 underline dark:text-brand-300">Perjalanan tubuh</Link> dan <Link href="/progress?tab=fitness" className="font-semibold text-brand-700 underline dark:text-brand-300">Fitness</Link>.</p>}
        {!connected && <button type="button" onClick={() => void createConnection()} disabled={loading || busy} className={`${primary} mt-4`}>{busy ? "Menyiapkan…" : "Siapkan koneksi"}</button>}
        {connected && !token && !verified && <button type="button" onClick={() => void createConnection()} disabled={loading || busy} className={`${primary} mt-4`}>{busy ? "Menyiapkan…" : "Lengkapi pemasangan"}</button>}
      </section>

      {connected && !token && verified && <section className={card} aria-label="Konfigurasi pemasangan">
        <h2 className="font-semibold">1. Konfigurasi untuk pemasangan baru</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">Shortcut yang sudah berfungsi tetap dapat dipakai. Untuk memasang templat baru, siapkan konfigurasi di sini terlebih dahulu.</p>
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">Tombol ini mengganti kunci lama. Pasang ulang Slothly Berat dan Slothly Watch yang digunakan dengan konfigurasi baru. Lewati jika tidak sedang memasang ulang.</p>
        <button type="button" onClick={() => void createConnection()} disabled={busy || loading} className={`${secondary} mt-3`}>{busy ? "Menyiapkan…" : "Siapkan pemasangan baru"}</button>
      </section>}

      {token && (
        <section className={`${card} space-y-4`} aria-label="Konfigurasi pemasangan">
          <div>
            <h2 className="font-semibold">1. Salin konfigurasi pribadimu</h2>
            <p className="mt-1 text-sm text-neutral-500">Tempel konfigurasi yang sama pada pertanyaan pemasangan Slothly Berat dan Slothly Watch. Konfigurasi ini mengizinkan pengiriman ke akunmu dan tersimpan di masing-masing Shortcut.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => void copyConfiguration()} disabled={copying || busy} className={secondary}>{copying ? "Menyalin…" : copied ? "Disalin ✓" : "Salin konfigurasi"}</button>
              <button type="button" onClick={showManualCopy} className={secondary}>Salin manual</button>
            </div>
            {showConfig && (
              <div className="mt-3 space-y-3 rounded-xl bg-neutral-50 p-3 dark:bg-neutral-950">
                <p className="text-sm leading-relaxed">Tekan Pilih teks, lalu gunakan Salin dari menu iPhone. Setelah selesai, tekan Sudah saya salin.</p>
                <textarea ref={configField} aria-label="Konfigurasi koneksi pribadi" readOnly value={configuration} onCopy={confirmManualCopy} onFocus={event => event.target.select()} className="min-h-28 w-full rounded-xl border border-neutral-300 p-3 font-mono text-xs dark:border-neutral-700 dark:bg-neutral-800" />
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={selectConfiguration} className={secondary}>Pilih teks</button>
                  <button type="button" onClick={confirmManualCopy} className={secondary}>Sudah saya salin</button>
                </div>
              </div>
            )}
          </div>
          {copied && <p className="text-sm font-semibold text-brand-700 dark:text-brand-300">Konfigurasi siap ditempel.</p>}
          <p className="border-t border-neutral-200 pt-3 text-xs leading-relaxed text-neutral-500 dark:border-neutral-800">Simpan untuk dirimu sendiri. Jika konfigurasi hilang, Sambungkan ulang akan mengganti akses lama; pasang ulang kedua Shortcut yang digunakan dengan konfigurasi baru.</p>
        </section>
      )}

      <section className="space-y-3" aria-label="Shortcut Slothly">
        <div><h2 className="font-semibold">2. Pasang Shortcut yang dibutuhkan</h2><p className="mt-1 text-sm text-neutral-500">Buka unduhan di iPhone, pilih Set Up Shortcut / Atur Pintasan, lalu tempel konfigurasi dari langkah 1. Lakukan untuk setiap Shortcut yang dipasang.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {shortcuts.map(({ id, name, download, icon: Icon, description }) => <article key={id} className={`${card} flex flex-col`} aria-label={name}>
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"><Icon className="h-5 w-5" /></span>
            <h3 className="font-semibold">{name}</h3><p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-500">{description}</p>
            <a href={download} className={`${secondary} mt-4`}>Pasang {name}</a>
            {connected && (verified || copied) && <a href={runShortcut(id)} className={`${primary} mt-2`}>{token ? `Buka ${name}` : `Sinkronkan ${id === "weight" ? "Berat" : "Watch"}`}</a>}
          </article>)}
        </div>
        <p className="text-xs leading-relaxed text-neutral-500">Jalankan masing-masing sekali dari Shortcuts dan izinkan akses Health serta koneksi ke Slothly. Metrik tanpa sampel dilewati. Jika iOS menghentikan proses karena izin, periksa Health → foto profil → Apps → Shortcuts.</p>
        <p className="text-xs leading-relaxed text-neutral-500">Gunakan kg untuk berat badan dan kcal untuk energi aktif di Health. Satuan yang tidak dikenali menghentikan pengiriman metrik tersebut agar nilainya tidak tersimpan dengan satuan yang salah.</p>
      </section>

      <section className={card}>
        <h2 className="font-semibold">3. Atur automasi di iPhone</h2>
        <p className="mt-2 text-sm text-neutral-500">Buat di aplikasi Shortcuts setelah menjalankan dan memberi izin pada Shortcut. Mengunduh file belum membuat automasi.</p>
        <details className="mt-4 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
          <summary className="min-h-8 cursor-pointer text-sm font-semibold">Slothly Watch · setiap hari 21.30</summary>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
            <li>Buka Shortcuts → Automation → + → Time of Day.</li>
            <li>Isi 21:30, pilih Daily, lalu Next.</li>
            <li>Pilih Run Shortcut → {shortcutNames.watch || defaultShortcutNames.watch}, pilih Run Immediately, lalu Done.</li>
          </ol>
          <p className="mt-3 text-xs text-neutral-500">Pastikan pengukuran dari Apple Watch atau sumber lain sudah tersedia di Apple Health. Watch tetap bisa dijalankan manual kapan saja.</p>
        </details>
        <details className="mt-3 rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
          <summary className="min-h-8 cursor-pointer text-sm font-semibold">Slothly Berat · setelah aplikasi timbangan ditutup</summary>
          <p className="mt-3 rounded-xl bg-brand-50 p-3 text-sm leading-relaxed text-brand-800 dark:bg-brand-950 dark:text-brand-200">Perlu timbangan digital dengan aplikasi pendamping yang menyimpan hasil ke Apple Health. Pilih nama aplikasi timbangan milikmu. AFit hanya contoh.</p>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
            <li>Buka Shortcuts → Automation → + → App.</li>
            <li>Pilih aplikasi timbanganmu, misalnya AFit. Centang Is Closed, hilangkan Is Opened, lalu Next.</li>
            <li>Pilih Run Shortcut → {shortcutNames.weight || defaultShortcutNames.weight}, pilih Run Immediately, matikan Notify When Run jika tersedia, lalu Done.</li>
            <li>Uji: timbang, tunggu hasil tampil di aplikasi timbangan dan Apple Health, lalu tutup aplikasi timbangan. Buka Slothly dan tekan Periksa status.</li>
          </ol>
          <p className="mt-3 text-xs text-neutral-500">Jika hasil belum masuk ke Apple Health saat aplikasi ditutup, jalankan Slothly Berat lagi setelah hasilnya tersedia. Slothly membaca Apple Health; penghubung ke timbangan tetap aplikasi milik timbanganmu.</p>
        </details>
        <a href="https://support.apple.com/guide/shortcuts/apdfbdbd7123/ios" target="_blank" rel="noreferrer" className="mt-3 inline-flex min-h-11 items-center text-xs font-semibold text-brand-700 underline dark:text-brand-300">Panduan automasi Apple</a>
      </section>

      <details className={card}>
        <summary className="cursor-pointer text-sm font-medium">Nama Shortcut di iPhone berbeda?</summary>
        <p className="mt-3 text-xs text-neutral-500">Samakan dengan nama di Shortcuts agar tombol Buka dan panduan automasi mengarah ke Shortcut yang benar.</p>
        {shortcuts.map(({ id, name }) => <div key={id} className="mt-3"><label htmlFor={`health-shortcut-${id}`} className="block text-sm font-medium">Nama Shortcut {id === "weight" ? "Berat" : "Watch"} di iPhone</label><input id={`health-shortcut-${id}`} value={shortcutNames[id]} maxLength={80} autoComplete="off" spellCheck={false} onChange={event => changeShortcutName(id, event.target.value)} onBlur={() => { if (!shortcutNames[id].trim()) changeShortcutName(id, name); }} className="mt-2 w-full rounded-xl border border-neutral-300 px-3 py-3 text-sm dark:border-neutral-700 dark:bg-neutral-800" /></div>)}
      </details>

      <details className={card}>
        <summary className="cursor-pointer text-sm font-medium">Data ada di Health, tetapi belum terbaca?</summary>
        <p className="mt-3 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">Jalankan pemeriksaan berat badan yang terpisah dari Shortcut sinkronisasi. Pemeriksaan ini menampilkan jumlah sampel yang terbaca dan tanggal sampel terbaru, tanpa menampilkan nilai berat.</p>
        <a href="/shortcuts/slothly-health-read-check.shortcut?v=1" className={`${secondary} mt-3`}>Unduh pemeriksaan Health</a>
        <p className="mt-3 text-xs leading-relaxed text-neutral-500">Tidak memerlukan konfigurasi akun, tidak menulis data Health, dan tidak mengirim hasil ke Slothly. Jumlah 1 berarti pembacaan dasar menemukan sampel; jumlah 0 belum menjelaskan penyebabnya. Jika iOS menghentikan tindakan dengan pesan error, catat pesan itu.</p>
      </details>

      {connected && (
        <details className={card}>
          <summary className="cursor-pointer text-sm font-medium">Kelola koneksi</summary>
          <p className="mt-3 text-sm text-neutral-500">Sambungkan ulang jika konfigurasi hilang atau akses perlu diganti. Ini menonaktifkan kunci lama: pasang ulang Slothly Berat dan Slothly Watch yang digunakan dengan konfigurasi baru. Shortcut yang sudah berfungsi tidak perlu disambungkan ulang.</p>
          {state?.legacy && <p className="mt-2 text-xs text-neutral-500">Shortcut lama masih dapat dipakai. Menyambungkan ulang akan mengganti aksesnya.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void createConnection()} disabled={busy} className={secondary}>{busy ? "Memproses…" : "Sambungkan ulang"}</button>
            <button type="button" onClick={() => void disconnect()} disabled={busy} className="min-h-11 rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-300">Putuskan koneksi</button>
          </div>
        </details>
      )}

      <details className={card}>
        <summary className="cursor-pointer text-sm font-medium">Masih memakai Shortcut gabungan sebelumnya?</summary>
        <p className="mt-3 text-sm leading-relaxed text-neutral-500">Shortcut gabungan yang sudah tersambung tetap dapat digunakan. Berat dan Watch memiliki konfigurasi sendiri saat pemasangan; konfigurasi yang tersimpan di Shortcut gabungan tidak otomatis dipakai keduanya.</p>
        <a href="/shortcuts/slothly-health-sync.shortcut?v=5" className={`${secondary} mt-3`}>Unduh Shortcut gabungan</a>
      </details>
      <p className="px-1 text-xs leading-relaxed text-neutral-500">Konfigurasi pribadi tersimpan di Shortcut yang kamu pasang. Jangan bagikan kembali Shortcut yang sudah diisi. Pengukuran tubuh dan fitness mempertahankan tanggal aslinya; kalori aktif masuk sebagai aktivitas hari ini.</p>
      <p className="px-1 text-xs leading-relaxed text-neutral-500">Health Connect untuk Android belum tersedia di versi ini.</p>
    </div>
  );
}
