# menuju kurus

Aplikasi personal untuk calorie tracking, weight management, fitness intelligence, dan keputusan makan sehari-hari. Dibuat mobile-first dengan Next.js, Gemini, Upstash Redis, dan Vercel free tier.

## Fitur utama

1. **Foto makanan → estimasi kalori dan makro.** Foto diproses in-memory, dikirim ke Gemini, lalu dibuang. Hanya hasil teks yang disimpan.
2. **Daily calorie tracking.** Catat makanan dan kalori keluar secara manual atau lewat Apple Shortcuts untuk Active Energy.
3. **Weight Intelligence.** Log berat, rata-rata 7/14 hari, weekly rate, grafik, target berat, dan ETA menuju target.
4. **Health Score & Weekly Budget.** Menggabungkan kalori, protein, tren berat, aktivitas, dan konsistensi.
5. **Daily Decision Coach & Recovery Mode.** Memberi prioritas harian tanpa puasa kompensasi atau olahraga sebagai hukuman.
6. **Fitness Intelligence.** Goal profile `weight_loss`, `very_lean`, `athletic`, atau `muscle_gain`, disertai VO₂ max, resting heart rate, cardio minutes, strength days, goal score, dan recap Gemini opsional.
7. **Nutrition Intelligence / Satiety Intelligence.** Membantu menjawab “apa keputusan makan terbaik saat ini?” berdasarkan sisa kalori, sisa protein, goal, craving, objective, dan bahan yang tersedia.
8. **AI recap manual.** Gemini hanya dipanggil saat user menekan tombol recap, agar penggunaan free tier tetap terkontrol.
9. **Dua user terpisah.** Satu deployment dapat dipakai dua orang dengan PIN, settings, Redis keys, dan Health Sync token terpisah.

## Navigasi

Empat tab di bottom nav, disusun sebagai alur keputusan harian, bukan daftar fitur:

- **Home** (`/`) — status hari ini (Health Score, sisa kalori, sisa protein), Daily Coach ("fokus berikutnya"), dan tiga tindakan utama: Catat Makan, Aku Lapar, Catat Berat.
- **Makan** (`/makan`) — dua mode dalam satu halaman: "Catat makanan" (foto → estimasi Gemini) dan "Butuh rekomendasi" (Nutrition/Satiety Intelligence), plus riwayat makan hari ini.
- **Progress** (`/progress`) — ringkasan Health Score/streak/berat di atas, lalu tab Berat, Fitness, dan Mingguan (weekly review + AI summary).
- **Profil** (`/settings`) — "Program Saya": Program & target, Data tubuh, Aktivitas & fitness, Integrasi, Akun.

Rencana harian (`/plan`, pilih Intermittent Fasting atau Defisit Kalori berdasarkan jam bangun) diakses kontekstual dari Home, bukan sebagai tab tersendiri.

## Nutrition Intelligence

Tersedia di tab **Makan**, mode "Butuh rekomendasi", menyediakan:

- Hunger mode: lapar, manis, gurih, renyah, comfort food, atau cepat dibuat.
- Objective filters: volume besar, protein tinggi, serat tinggi, kalori tipis, dan vegetarian.
- Pantry input berupa daftar bahan yang tersedia.
- Deterministic ranking dari food library lokal.
- **Fullness Score 1–5** berdasarkan kombinasi volume, protein, serat, dan kepadatan energi.
- Target meal budget berdasarkan sisa kalori dan protein hari itu.
- Penjelasan “kenapa ini disarankan?”.
- Gemini recap opsional dengan tepat tiga saran praktis.

Fullness Score adalah heuristik produk, bukan pengukuran klinis. Rekomendasi tidak dimaksudkan untuk diagnosis atau terapi medis.

## Arsitektur keputusan

```text
Data harian + Settings + Goal
              ↓
Deterministic TypeScript engines
              ↓
Structured recommendation
              ↓
Gemini explanation (manual only)
```

Gemini tidak menjadi sumber logika utama. Engine lokal menghitung ranking, score, remaining calories, remaining protein, dan safety constraints terlebih dahulu.

## Stack

- Next.js 14 App Router + Tailwind CSS
- Vercel Hobby/free plan
- Google Gemini API, default `gemini-2.5-flash`
- Upstash Redis REST API
- HMAC session cookie dengan PIN login
- Apple Shortcuts sebagai bridge ke Apple Health

## Environment variables

| Variable | Keterangan |
|---|---|
| `SESSION_SECRET` | string acak panjang untuk tanda tangan cookie |
| `USER1_NAME` | nama user pertama |
| `USER1_PASSWORD` | PIN/password user pertama |
| `USER1_HEALTH_SYNC_TOKEN` | token rahasia buatan sendiri untuk Apple Shortcuts |
| `USER2_NAME` | opsional, kosongkan bila hanya satu user |
| `USER2_PASSWORD` | opsional |
| `USER2_HEALTH_SYNC_TOKEN` | opsional |
| `GEMINI_API_KEY` | API key dari Google AI Studio |
| `GEMINI_MODEL` | opsional, default `gemini-2.5-flash` |
| `UPSTASH_REDIS_REST_URL` | URL Redis dari Upstash/Vercel |
| `UPSTASH_REDIS_REST_TOKEN` | token Redis dari Upstash/Vercel |

Untuk local development gunakan `.env.local`. Untuk production isi melalui Vercel Project Settings → Environment Variables.

## Menjalankan lokal

```bash
npm install
npm run dev
```

Sanity check sebelum merge/deploy:

```bash
npm run build
```

## Apple Health Active Energy Sync

Karena ini web app, HealthKit tidak bisa dibaca langsung. Gunakan Apple Shortcuts:

1. Find Health Samples → Active Energy → Start Date is Today.
2. Calculate Statistics / Sum.
3. POST ke `https://<domain>/api/health-sync`.
4. Header: `Authorization: Bearer <USER_HEALTH_SYNC_TOKEN>`.
5. JSON body:

```json
{
  "calories": 450
}
```

Endpoint mengganti total Active Energy hari itu, bukan menumpuk setiap sync.

## Prinsip keselamatan produk

- Tidak mendorong puasa kompensasi, muntah, atau olahraga sebagai hukuman.
- Very lean mode tidak mengejar body-fat serendah mungkin.
- VO₂ max dan body fat dari wearable/smart scale dianggap estimasi perangkat.
- Gemini dilarang mengarang makanan, aktivitas, diagnosis, usia, jenis kelamin, atau riwayat medis.
- Perubahan target penting tetap memerlukan persetujuan user.

## Roadmap setelah Sprint 6

- Body reference dan program-calorie engine: BMI, BMR/TDEE, target kalori sesuai goal.
- Apple Health Sync V2: berat, body fat, VO₂ max, resting heart rate, workout duration.
- Meal swap dan “Can I Eat This?” berbasis hasil analisis foto.
- Restaurant and pantry intelligence.
- Habit learning dan adaptive coaching setelah data penggunaan mencukupi.

## Batasan saat ini

- Maksimal dua user, bukan sistem registrasi umum.
- Foto makanan tidak disimpan.
- Estimasi foto, MET, VO₂ max, body fat, Fullness Score, dan ETA berat adalah perkiraan.
- Health sync masih melalui Shortcuts, bukan aplikasi iOS native.
