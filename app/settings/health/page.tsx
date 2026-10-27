"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { IconActivity, IconScaleWeight } from "@/components/icons";

type ConnectionState = {
  configured: boolean;
  legacy: boolean;
  createdAt: string | null;
  lastTestAt: string | null;
  lastPairedAt?: string | null;
  lastSync: { receivedAt: string; provider: string; dates: string[]; fields: string[] } | null;
};

const shortcuts = [
  { id: "weight", name: "Slothly Berat", download: "/shortcuts/Slothly%20Berat.shortcut?v=2", icon: IconScaleWeight, description: "Berat badan dan persentase lemak yang tersedia di Apple Health hari ini." },
  { id: "watch", name: "Slothly Watch", download: "/shortcuts/Slothly%20Watch.shortcut?v=2", icon: IconActivity, description: "VO₂ max, detak jantung istirahat, dan jumlah kalori aktif hari ini dari Apple Health." },
] as const;
type ShortcutKind = (typeof shortcuts)[number]["id"];
const defaultShortcutNames = { weight: "Slothly Berat", watch: "Slothly Watch" };
const shortcutNamesKey = "mk_health_shortcut_names_v1";
type Pairing = { code: string; expiresAt: string; redeemUrl: string };
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
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [pairingBusy, setPairingBusy] = useState(false);
  const [pairingError, setPairingError] = useState("");
  const [shortcutNames, setShortcutNames] = useState(defaultShortcutNames);
  const [message, setMessage] = useState("");
  const alive = useRef(true);
  const mutationVersion = useRef(0);
  const mutating = useRef(false);
  const authenticated = useRef(false);
  const pairExpiry = useRef(0);
  const pairSerial = useRef(0);
  const pairRequest = useRef<number | null>(null);
  const pairAbort = useRef<AbortController | null>(null);
  const statusSerial = useRef(0);

  const preparePairing = useCallback(async (force = false) => {
    if (!alive.current || !authenticated.current || mutating.current || pairRequest.current !== null) return;
    if (!force && pairExpiry.current - Date.now() > 60_000) return;
    const version = mutationVersion.current;
    const request = ++pairSerial.current;
    pairRequest.current = request;
    pairExpiry.current = 0;
    setPairing(null); setPairingBusy(true); setPairingError("");
    const controller = new AbortController();
    pairAbort.current = controller;
    const timeout = window.setTimeout(() => controller.abort(), 12_000);
    const current = () => alive.current && version === mutationVersion.current && pairRequest.current === request && !mutating.current;
    try {
      const response = await fetch("/api/health-pairing", { method: "POST", cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Tombol penghubung belum siap. Coba lagi.");
      const data: Pairing = await response.json();
      if (!data.code || typeof data.code !== "string" || !data.redeemUrl || typeof data.redeemUrl !== "string" || !Number.isFinite(Date.parse(data.expiresAt)) || Date.parse(data.expiresAt) <= Date.now()) throw new Error("Tombol penghubung belum siap. Coba lagi.");
      if (current()) { pairExpiry.current = Date.parse(data.expiresAt); setPairing({ code: data.code, expiresAt: data.expiresAt, redeemUrl: data.redeemUrl }); }
    } catch (cause) {
      if (current()) setPairingError(cause instanceof Error && cause.name !== "AbortError" ? cause.message : "Tombol penghubung belum siap. Coba lagi.");
    } finally {
      window.clearTimeout(timeout);
      if (pairRequest.current === request) {
        pairRequest.current = null;
        pairAbort.current = null;
        if (alive.current && version === mutationVersion.current && !mutating.current) setPairingBusy(false);
      }
    }
  }, []);

  const load = useCallback(async (silent = false) => {
    if (mutating.current) return;
    const version = mutationVersion.current;
    const request = ++statusSerial.current;
    if (!silent) { setLoading(true); setError(""); }
    try {
      const response = await fetch("/api/health-connection", { cache: "no-store" });
      if (!response.ok) throw new Error("Status koneksi belum dapat dimuat. Coba lagi.");
      const data: ConnectionState = await response.json();
      if (alive.current && version === mutationVersion.current && request === statusSerial.current && !mutating.current) {
        setState(data); authenticated.current = true;
        void preparePairing();
      }
    } catch (cause) {
      if (alive.current && version === mutationVersion.current && request === statusSerial.current && !silent) setError(cause instanceof Error ? cause.message : "Status koneksi belum dapat dimuat.");
    } finally { if (alive.current && version === mutationVersion.current && request === statusSerial.current) setLoading(false); }
  }, [preparePairing]);

  useEffect(() => {
    alive.current = true;
    try {
      const saved = JSON.parse(localStorage.getItem(shortcutNamesKey) || "{}");
      setShortcutNames({ weight: typeof saved.weight === "string" && saved.weight.trim() ? saved.weight.trim().slice(0, 80) : defaultShortcutNames.weight, watch: typeof saved.watch === "string" && saved.watch.trim() ? saved.watch.trim().slice(0, 80) : defaultShortcutNames.watch });
    } catch { /* Device storage is optional; the installed filename is the default. */ }
    void load();
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      void load(true);
      void preparePairing(true);
    };
    const poll = () => {
      if (document.visibilityState !== "visible") return;
      void load(true);
      void preparePairing();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const interval = window.setInterval(poll, 15_000);
    return () => {
      alive.current = false;
      mutationVersion.current++;
      pairSerial.current++;
      pairRequest.current = null;
      pairAbort.current?.abort();
      pairAbort.current = null;
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, preparePairing]);

  async function disconnect() {
    if (mutating.current) return;
    mutationVersion.current++; mutating.current = true;
    pairSerial.current++; pairRequest.current = null;
    pairAbort.current?.abort(); pairAbort.current = null;
    pairExpiry.current = 0;
    setPairing(null); setPairingBusy(false); setPairingError("");
    setBusy(true); setLoading(false); setError(""); setMessage("");
    const version = mutationVersion.current;
    try {
      const response = await fetch("/api/health-connection", { method: "DELETE" });
      if (!response.ok) throw new Error("Koneksi belum dapat diputus. Coba lagi.");
      const data: ConnectionState = await response.json();
      if (alive.current && version === mutationVersion.current) {
        setState(data);
        setMessage("Koneksi diputus. Hasil pengukuran yang sudah masuk tetap tersimpan.");
      }
    } catch (cause) { if (alive.current && version === mutationVersion.current) setError(cause instanceof Error ? cause.message : "Koneksi belum dapat diputus."); }
    finally {
      if (version === mutationVersion.current) {
        mutating.current = false;
        if (alive.current) { setBusy(false); void preparePairing(true); }
      }
    }
  }

  const runShortcut = (kind: ShortcutKind) => `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutNames[kind].trim() || defaultShortcutNames[kind])}`;
  const connectShortcut = (kind: ShortcutKind) => pairing && Date.parse(pairing.expiresAt) > Date.now()
    ? `${runShortcut(kind)}&input=text&text=${encodeURIComponent(JSON.stringify({ code: pairing.code, redeemUrl: pairing.redeemUrl }))}` : "";

  function changeShortcutName(kind: ShortcutKind, value: string) {
    const next = { ...shortcutNames, [kind]: value };
    setShortcutNames(next);
    try {
      localStorage.setItem(shortcutNamesKey, JSON.stringify({ ...next, [kind]: value.trim() || defaultShortcutNames[kind] }));
    } catch { /* The name still works for this visit if device storage is blocked. */ }
  }

  const connected = state?.configured;
  const currentReceipt = state?.lastSync && (!state.createdAt || Date.parse(state.lastSync.receivedAt) >= Date.parse(state.createdAt));
  const title = !connected ? "Belum terhubung" : currentReceipt ? "Data sudah diterima" : state?.lastPairedAt ? "Akses akun tersambung" : state?.lastTestAt ? "Koneksi diuji, data belum masuk" : "Selesaikan pemasangan";

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4 pb-8">
      <Link href="/settings" className="inline-flex min-h-11 items-center text-sm text-neutral-500">← Kembali ke Profil</Link>
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-brand-700 dark:text-brand-300">Data kesehatan · iPhone</p>
        <h1 className="mt-1 text-2xl font-bold">Hubungkan Apple Health</h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">Pasang Shortcut yang dibutuhkan, hubungkan akun lewat salah satunya, lalu izinkan pembacaan Apple Health. Setelah itu kamu bisa menjalankan keduanya atau mengatur automasi.</p>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">Halaman ini opsional dan hanya untuk iPhone. Tanpa koneksi, Slothly tetap lengkap: berat dan ukuran tubuh dicatat di Progress → Tubuh, aktivitas di Home.</p>
      </header>

      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-200">{error}</p>}
      {message && <p role="status" className="rounded-xl bg-brand-50 p-3 text-sm text-brand-800 dark:bg-brand-950 dark:text-brand-200">{message}</p>}

      <section className={card} aria-label="Status sinkronisasi">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-semibold">{loading && !state ? "Memuat status…" : title}</h2>
            {state && !connected && <p className="mt-1 text-sm text-neutral-500">Pasang Shortcut, lalu pilih Hubungkan akun di bawah.</p>}
            {connected && !currentReceipt && <p className="mt-1 text-sm text-neutral-500">Jalankan Shortcut yang sudah dihubungkan untuk mengirim pengukuran, lalu periksa status setelah selesai.</p>}
          </div>
          <button type="button" onClick={() => void load()} disabled={loading || busy} className="min-h-11 text-sm font-medium text-brand-700 disabled:opacity-50 dark:text-brand-300">{loading ? "Memeriksa…" : "Periksa status"}</button>
        </div>
        {connected && state?.lastPairedAt && <p className="mt-3 text-xs text-neutral-500">Akses akun disambungkan: {timestamp(state.lastPairedAt)}</p>}
        {connected && state?.lastTestAt && <p className="mt-3 text-xs text-neutral-500">Koneksi diuji: {timestamp(state.lastTestAt)}</p>}
        {state?.lastSync && (
          <dl className="mt-3 space-y-2 text-sm">
            <div><dt className="text-neutral-500">{connected && currentReceipt ? "Data terakhir diterima" : "Data dari koneksi sebelumnya"}</dt><dd>{timestamp(state.lastSync.receivedAt)}</dd></div>
            <div><dt className="text-neutral-500">Tanggal pengukuran</dt><dd>{state.lastSync.dates.map(measurementDate).join(", ")}</dd></div>
            <div><dt className="text-neutral-500">Data pada pengiriman terakhir</dt><dd>{state.lastSync.fields.map(field => fieldLabels[field] ?? field).join(", ")}</dd></div>
          </dl>
        )}
        {state?.lastSync && <p className="mt-3 text-xs leading-relaxed text-neutral-500">Setiap metrik dikirim terpisah. Lihat seluruh hasil di <Link href="/progress?tab=body" className="font-semibold text-brand-700 underline dark:text-brand-300">Progress tubuh</Link> dan <Link href="/progress?tab=fitness" className="font-semibold text-brand-700 underline dark:text-brand-300">Fitness</Link>.</p>}
        <p className="mt-3 text-xs leading-relaxed text-neutral-500">Status ini menunjukkan aktivitas akun. Untuk iPhone yang baru dipasang, tetap lakukan Hubungkan akun sekali.</p>
      </section>

      <section className="space-y-3" aria-label="Shortcut Slothly">
        <div><h2 className="font-semibold">1. Pasang Shortcut yang dibutuhkan</h2><p className="mt-1 text-sm text-neutral-500">Buka unduhan di iPhone, lalu pilih Tambah Shortcut. Pasang keduanya jika ingin memakai Berat dan Watch.</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          {shortcuts.map(({ id, name, download, icon: Icon, description }) => <article key={id} className={`${card} flex flex-col`} aria-label={name}>
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700 dark:bg-brand-950 dark:text-brand-300"><Icon className="h-5 w-5" /></span>
            <h3 className="font-semibold">{name}</h3><p className="mt-2 flex-1 text-sm leading-relaxed text-neutral-500">{description}</p>
            <a href={download} className={`${secondary} mt-4`}>Pasang {name}</a>
            {connectShortcut(id) && !busy
              ? <a href={connectShortcut(id)} className={`${primary} mt-2`}>Hubungkan lewat {name}</a>
              : <button type="button" disabled className={`${primary} mt-2`}>Hubungkan lewat {name}</button>}
            <a href={runShortcut(id)} className={`${secondary} mt-2`}>Buka {name}</a>
          </article>)}
        </div>
      </section>

      <section className={card} aria-label="Hubungkan akun">
        <h2 className="font-semibold">2. Hubungkan akun sekali</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">Pilih salah satu Shortcut yang sudah dipasang. Koneksi tersimpan bersama di iPhone, jadi Berat dan Watch dapat memakainya tanpa perlu menghubungkan dua kali.</p>
        {pairingBusy && <p role="status" className="mt-3 text-xs text-neutral-500">Menyiapkan tombol penghubung…</p>}
        {pairingError && <div className="mt-3"><p role="alert" className="text-sm text-red-700 dark:text-red-300">{pairingError}</p><button type="button" onClick={() => void preparePairing(true)} disabled={pairingBusy || busy} className={`${secondary} mt-2`}>Coba siapkan lagi</button></div>}
        <p className="mt-3 text-xs leading-relaxed text-neutral-500">Izinkan Shortcuts membuka koneksi ke Slothly dan membaca data Health saat diminta. Setelah terhubung, gunakan Buka Shortcut untuk sinkronisasi berikutnya. Hubungkan lagi dari halaman ini jika mengganti iPhone atau koneksi perlu dipasang kembali.</p>
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">Tombol penghubung berlaku sebentar dan diperbarui otomatis. Menyiapkan tombol ini tidak mengubah koneksi yang sudah berfungsi.</p>
        <p className="mt-2 text-xs leading-relaxed text-neutral-500">Metrik tanpa sampel dilewati. Jika iOS menghentikan proses karena izin, periksa Health → foto profil → Apps → Shortcuts.</p>
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
        <p className="mt-3 text-xs text-neutral-500">Samakan dengan nama di Shortcuts agar tombol Hubungkan, Buka, dan panduan automasi mengarah ke Shortcut yang benar.</p>
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
          <p className="mt-3 text-sm text-neutral-500">Putuskan koneksi untuk menonaktifkan seluruh akses Shortcut ke akunmu. Jika ingin memakai lagi, pilih Hubungkan akun dari halaman ini. Hasil pengukuran tetap tersimpan.</p>
          {state?.legacy && <p className="mt-2 text-xs text-neutral-500">Shortcut lama yang sudah bekerja tetap dapat dipakai. Menghubungkan Shortcut baru tidak memutus akses lainnya.</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => void disconnect()} disabled={busy} className="min-h-11 rounded-xl border border-red-200 px-4 py-3 text-sm font-medium text-red-700 disabled:opacity-50 dark:border-red-900 dark:text-red-300">Putuskan koneksi</button>
          </div>
        </details>
      )}

      <details className={card}>
        <summary className="cursor-pointer text-sm font-medium">Masih memakai Shortcut gabungan sebelumnya?</summary>
        <p className="mt-3 text-sm leading-relaxed text-neutral-500">Shortcut gabungan yang sudah tersambung tetap dapat digunakan. Untuk beralih ke Berat dan Watch terbaru, pasang dari unduhan di atas lalu pilih Hubungkan akun sekali. Akses Shortcut lama tetap berlaku sampai koneksi diputus.</p>
      </details>
      <p className="px-1 text-xs leading-relaxed text-neutral-500">Koneksi pribadi tersimpan di folder Shortcuts/Slothly di iPhone dan dapat mengikuti pengaturan iCloud. Simpan untuk dirimu sendiri. Pengukuran tubuh dan fitness mempertahankan tanggal aslinya; kalori aktif masuk sebagai aktivitas hari ini.</p>
      <p className="px-1 text-xs leading-relaxed text-neutral-500">Health Connect untuk Android belum tersedia di versi ini.</p>
    </div>
  );
}
