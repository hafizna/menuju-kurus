# menuju kurus

Aplikasi pelacak kalori & rencana harian personal. Dibuat simpel, mobile-first,
untuk dipakai sendiri (bukan multi-user), dan jalan gratis di Vercel.

## Fitur

1. **Foto makanan → estimasi kalori.** Upload/ambil foto dari HP, dianalisa
   pakai Gemini (Google AI Studio, free tier) untuk estimasi kalori & makro.
   Foto **tidak pernah disimpan** ke server — hanya dipakai sesaat untuk
   dikirim ke Gemini lalu dibuang, hasilnya (teks) yang disimpan.
2. **Kalori keluar harian.** Input manual di dashboard, atau otomatis lewat
   automation Apple Shortcuts yang kirim Active Energy dari app Health ke
   `/api/health-sync` (lihat panduan di bawah).
3. **Rencana harian berbasis jam bangun.** Buka halaman "Rencana", app kasih
   saran (Intermittent Fasting kalau bangun siang, Defisit Kalori terjadwal
   kalau bangun pagi) — tapi keputusan akhir tetap di tangan kamu.
4. **Gamifikasi.** Streak counter (hari berturut-turut berhasil di bawah
   target kalori) + tantangan harian yang berganti tiap hari. Kalau kalori
   hari ini kelebihan, dashboard otomatis kasih saran olahraga (lari berapa
   km / cardio berapa menit) buat nebus kelebihannya.

## Stack (semua free tier)

- **Next.js 14 (App Router)** + Tailwind, deploy ke **Vercel** (Hobby/free plan)
- **Google Gemini API** (`gemini-2.5-flash`) untuk vision/analisa foto makanan —
  free tier di [Google AI Studio](https://aistudio.google.com/apikey), tidak perlu kartu kredit
- **Upstash Redis** (integrasi Vercel Marketplace, free tier) untuk simpan log
  harian, target, dan streak — data kecil (tidak ada foto), jadi cukup ringan
- PIN login sederhana (cookie HMAC, tanpa database sesi) supaya URL publik
  tidak sembarangan dipakai orang lain / menghabiskan quota Gemini kamu

## Kenapa tidak simpan foto?

Karena dianggap tidak perlu histori foto untuk personal use, foto makanan
dianalisa in-memory di server lalu langsung dibuang — tidak pernah ditulis ke
Redis atau disk. Yang disimpan cuma hasil analisanya (nama makanan, kalori,
makro) sebagai teks kecil. Ini otomatis lebih hemat daripada "hapus setelah
seminggu" karena memang tidak pernah tersimpan sama sekali.

## Setup

### 1. Google Gemini API key

1. Buka https://aistudio.google.com/apikey, login dengan akun Google.
2. Klik "Create API key" → copy key-nya.

### 2. Upstash Redis

Cara termudah: dari dashboard project Vercel kamu → tab **Storage** → **Marketplace
Database Providers** → pilih **Upstash** → buat database Redis (free tier) →
connect ke project ini. Vercel otomatis mengisi env var
`UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN`.

Alternatif manual: buat database di https://console.upstash.com (free tier),
lalu copy `UPSTASH_REDIS_REST_URL` dan `UPSTASH_REDIS_REST_TOKEN` dari tab
"REST API".

### 3. Environment variables

Isi berdasarkan `.env.example`:

| Var | Keterangan |
|---|---|
| `APP_PASSWORD` | PIN buat login ke app (bebas, misal 6 digit angka) |
| `GEMINI_API_KEY` | dari langkah 1 |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | dari langkah 2 |
| `HEALTH_SYNC_TOKEN` | token rahasia bikin sendiri, buat autentikasi Apple Shortcuts (lihat bawah) |

Untuk local dev, copy ke `.env.local`. Untuk Vercel, isi di Project Settings → Environment Variables.

### 4. Deploy ke Vercel

```bash
npm install
npm run build   # opsional, sanity check lokal
```

Push repo ini ke GitHub lalu import ke [vercel.com/new](https://vercel.com/new),
atau pakai Vercel CLI (`vercel --prod`). Set environment variables di atas
sebelum/selama deploy.

### 5. (Opsional) Sinkron kalori keluar otomatis dari iPhone via Apple Shortcuts

Karena app ini web-based, tidak bisa akses HealthKit langsung. Solusinya pakai
**Shortcuts** (app bawaan iPhone, gratis, tanpa app tambahan):

1. Buka app **Shortcuts** → tab **Automation** → **+** → **Create Personal Automation**.
2. Pilih trigger sesukamu, misalnya **Time of Day** (jalan tiap jam tertentu)
   atau **App** → saat buka app tertentu. Matikan "Ask Before Running" biar
   jalan otomatis di background.
3. Add action **Find Health Samples where** → tipe **Active Energy** → filter
   **Start Date is Today**.
4. Add action **Calculate Statistics** (atau **Sum**) dari hasil di atas untuk
   dapat total kalori terbakar hari ini.
5. Add action **Get Contents of URL**:
   - URL: `https://<domain-vercel-kamu>/api/health-sync`
   - Method: `POST`
   - Headers: `Authorization: Bearer <isi dengan HEALTH_SYNC_TOKEN kamu>`
   - Request Body: JSON → `{"calories": <hasil langkah 4>}`
6. Simpan. Tiap automation ini jalan, dashboard app otomatis update kalori
   terbakar hari ini (menimpa angka sebelumnya dengan total terbaru, bukan
   menumpuk).

Kalau ribet / device bukan iPhone, cukup pakai input manual "Catat kalori
keluar" di dashboard — sudah cukup untuk pemakaian sehari-hari.

## Cara kerja logika utama

- **Hari** dihitung berdasarkan timezone di Settings (default `Asia/Jakarta`),
  bukan UTC server, supaya pergantian hari sesuai jam lokal kamu.
- **Rencana harian**: saran IF vs defisit berdasarkan jam saat kamu membuka
  halaman Rencana (≥ jam 9 → saran IF, < jam 9 → saran defisit). Tetap bisa
  pilih manual, saran cuma penanda "Rekomendasi".
- **Sukses harian** (dipakai buat streak & success rate): kalori bersih
  (masuk − keluar) hari itu ≤ target, dan minimal ada 1 meal tercatat (hari
  kosong tidak dihitung sukses).
- **Streak**: dihitung on-demand dengan menelusuri mundur dari kemarin,
  berhenti di hari pertama yang gagal/kosong. Tidak perlu cron job.
- **Saran olahraga penebus**: pakai rumus MET standar
  (`kcal/menit = MET × 3.5 × berat(kg) / 200`), dengan beberapa pilihan
  aktivitas (lari, jalan cepat, lompat tali, sepeda, HIIT).

## Batasan yang disengaja (biar tetap simpel)

- Single-user, tidak ada sistem akun — cukup 1 PIN untuk kamu sendiri.
- Tidak ada histori/penyimpanan foto makanan sama sekali.
- Sinkron Health hanya lewat Apple Shortcuts (bukan integrasi HealthKit native),
  karena ini web app, bukan app iOS native.
- Estimasi kalori dari foto & rumus olahraga adalah **perkiraan**, bukan
  pengukuran presisi — cukup untuk keperluan tracking harian personal.
