# menuju kurus

Aplikasi pelacak kalori & rencana harian. Dibuat simpel, mobile-first, untuk
dipakai berdua (kamu + 1 orang lain, masing-masing data terpisah), jalan
gratis di Vercel.

## Fitur

1. **Foto makanan → estimasi kalori.** Upload/ambil foto dari HP, dianalisa
   pakai Gemini (Google AI Studio, free tier) untuk estimasi kalori & makro.
   Foto **tidak pernah disimpan** ke server — hanya dipakai sesaat untuk
   dikirim ke Gemini lalu dibuang, hasilnya (teks) yang disimpan.
2. **Kalori keluar harian.** Input manual di dashboard, atau otomatis lewat
   automation Apple Shortcuts yang kirim Active Energy dari app Health ke
   `/api/health-sync` (lihat panduan di bawah).
3. **Rencana harian berbasis jam bangun.** Buka halaman "Rencana", masukkan
   jam kamu bangun tadi (bukan jam buka app — bisa beda kalau baru sempat
   buka HP belakangan), lalu app kasih saran program yang cocok hari itu
   (Intermittent Fasting kalau bangun siang, Defisit Kalori terjadwal kalau
   bangun pagi). Keputusan akhir tetap di tangan kamu, saran cuma penanda.
4. **Gamifikasi.** Streak counter (hari berturut-turut berhasil di bawah
   target kalori) + tantangan harian yang berganti tiap hari (beda tiap
   user). Kalau kalori hari ini kelebihan, dashboard otomatis kasih saran
   olahraga (lari berapa km / cardio berapa menit) buat nebus kelebihannya.
5. **2 user terpisah.** Satu deployment bisa dipakai berdua — masing-masing
   punya PIN, target kalori, log makanan, streak, dan token sinkron Health
   sendiri-sendiri. Cukup isi `USER2_*` kalau mau pakai berdua, kosongkan
   kalau cuma untuk sendiri.

## Stack (semua free tier)

- **Next.js 14 (App Router)** + Tailwind, deploy ke **Vercel** (Hobby/free plan)
- **Google Gemini API** (`gemini-2.5-flash`) untuk vision/analisa foto makanan —
  free tier di [Google AI Studio](https://aistudio.google.com/apikey), tidak perlu kartu kredit
- **Upstash Redis** (integrasi Vercel Marketplace, free tier) untuk simpan log
  harian, target, dan streak per user — data kecil (tidak ada foto), jadi
  cukup ringan
- PIN login sederhana per user (cookie HMAC, tanpa database sesi) supaya URL
  publik tidak sembarangan dipakai orang lain / menghabiskan quota Gemini
  kamu

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
| `SESSION_SECRET` | string acak panjang bebas, buat tanda tangan cookie sesi (bukan PIN) |
| `USER1_NAME`, `USER1_PASSWORD` | nama & PIN user pertama (wajib) |
| `USER1_HEALTH_SYNC_TOKEN` | token rahasia bikin sendiri, buat autentikasi Apple Shortcuts user 1 |
| `USER2_NAME`, `USER2_PASSWORD`, `USER2_HEALTH_SYNC_TOKEN` | sama seperti di atas untuk user kedua — kosongkan semua kalau hanya dipakai sendiri |
| `GEMINI_API_KEY` | dari langkah 1 |
| `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` | dari langkah 2 |

Login otomatis mendeteksi siapa yang masuk berdasarkan PIN mana yang cocok —
tidak perlu pilih nama user di layar login, cukup 1 kolom PIN.

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
**Shortcuts** (app bawaan iPhone, gratis, tanpa app tambahan). Ulangi langkah
ini di HP masing-masing user, dengan token milik user itu sendiri
(`USER1_HEALTH_SYNC_TOKEN` / `USER2_HEALTH_SYNC_TOKEN`):

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
   - Headers: `Authorization: Bearer <isi dengan HEALTH_SYNC_TOKEN milikmu>`
   - Request Body: JSON → `{"calories": <hasil langkah 4>}`
6. Simpan. Tiap automation ini jalan, dashboard app otomatis update kalori
   terbakar hari ini punya user yang sesuai tokennya (menimpa angka
   sebelumnya dengan total terbaru, bukan menumpuk).

Kalau ribet / device bukan iPhone, cukup pakai input manual "Catat kalori
keluar" di dashboard — sudah cukup untuk pemakaian sehari-hari.

## Cara kerja logika utama

- **Hari** dihitung berdasarkan timezone di Settings (default `Asia/Jakarta`),
  bukan UTC server, supaya pergantian hari sesuai jam lokal kamu.
- **Rencana harian**: begitu kamu isi jam bangun di halaman Rencana, jam itu
  (dikonversi dari waktu lokal ke waktu sebenarnya) dipakai sebagai patokan
  saran (≥ jam 9 → saran IF, < jam 9 → saran defisit) dan sebagai jangkar
  window makan kalau pilih IF. Bukan jam saat kamu kebetulan buka halamannya
  — bisa diubah lagi kalau salah input.
- **Sukses harian** (dipakai buat streak & success rate): kalori bersih
  (masuk − keluar) hari itu ≤ target, dan minimal ada 1 meal tercatat (hari
  kosong tidak dihitung sukses).
- **Streak**: dihitung on-demand per user dengan menelusuri mundur dari
  kemarin, berhenti di hari pertama yang gagal/kosong. Tidak perlu cron job.
- **Saran olahraga penebus**: pakai rumus MET standar
  (`kcal/menit = MET × 3.5 × berat(kg) / 200`), dengan beberapa pilihan
  aktivitas (lari, jalan cepat, lompat tali, sepeda, HIIT).
- **Multi-user**: cookie sesi berisi `userId` + tanda tangan HMAC (pakai
  `SESSION_SECRET`), tanpa perlu tabel sesi di database. Semua data di Redis
  diberi prefix per user (`mk:<userId>:...`) supaya benar-benar terpisah.

## Belum sempat / sengaja belum dibuat

- **Integrasi kalender/jadwal harian** untuk ikut mempertimbangkan rencana
  hari itu — ide bagus untuk pemakaian yang lebih "profesional", tapi
  disengaja belum dibuat dulu supaya tetap simpel.
- Tidak ada histori/penyimpanan foto makanan sama sekali (lihat penjelasan
  di atas).
- Sinkron Health hanya lewat Apple Shortcuts (bukan integrasi HealthKit
  native), karena ini web app, bukan app iOS native.
- Estimasi kalori dari foto & rumus olahraga adalah **perkiraan**, bukan
  pengukuran presisi — cukup untuk keperluan tracking harian.
- Maksimal 2 user (via `USER1_*`/`USER2_*`), bukan sistem akun umum dengan
  pendaftaran bebas.
