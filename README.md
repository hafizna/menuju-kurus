# menuju kurus

Aplikasi personal untuk calorie tracking, weight management, fitness intelligence, dan keputusan makan sehari-hari. Dibuat mobile-first dengan Next.js, Gemini, Upstash Redis, dan Vercel free tier.

Menuju Kurus diposisikan sebagai **personal nutrition decision assistant**: logika lokal menentukan keputusan, sedangkan AI hanya menjelaskan hasil yang sudah dihitung.

## Fitur utama

1. **Foto makanan → estimasi kalori dan makro.** Foto diproses in-memory, dikirim ke Gemini, lalu dibuang. Hanya hasil teks yang disimpan.
2. **Daily calorie tracking.** Catat makanan dan kalori keluar secara manual atau lewat Apple Shortcuts untuk Active Energy.
3. **Weight Intelligence.** Log berat, rata-rata 7/14 hari, weekly rate, grafik, target berat, dan ETA menuju target.
4. **Health Score & Weekly Budget.** Menggabungkan kalori, protein, tren berat, aktivitas, dan konsistensi.
5. **Personal Adaptive Coach & Recovery Mode.** Meranking fokus berikutnya dari status hari ini, budget mingguan, tren berat, pola 28 hari, dan konteks lapar/craving/makan di luar—tanpa puasa kompensasi atau olahraga sebagai hukuman.
6. **Fitness Intelligence.** Goal profile `weight_loss`, `very_lean`, `athletic`, atau `muscle_gain`, disertai VO₂ max, resting heart rate, cardio minutes, strength days, goal score, dan recap Gemini opsional.
7. **Nutrition Intelligence / Satiety Intelligence.** Menjawab “apa keputusan makan terbaik saat ini?” berdasarkan sisa kalori, sisa protein, goal, craving, objective, dan bahan yang tersedia.
8. **Restaurant Intelligence.** Cari menu Indonesia tanpa foto, lihat asumsi porsi dan ranking kontekstual, lalu simpan sebagai estimasi manual.
9. **Habit Intelligence.** Pelajari menu berulang dan waktu makan dalam rolling 28 hari, lalu quick add dari rata-rata catatan pengguna sendiri.
10. **AI recap manual.** Gemini hanya dipanggil saat user menekan tombol recap, agar penggunaan free tier tetap terkontrol.
11. **Tiga user terpisah.** Satu deployment dapat dipakai hingga tiga orang dengan PIN, settings, Redis keys, dan Health Sync token terpisah.

## Navigasi

Empat tab di bottom nav, disusun sebagai alur keputusan harian, bukan daftar fitur:

- **Home** (`/`) — status hari ini dan Personal Adaptive Coach dengan konteks Sekarang, Lapar, Sangat lapar, Craving, atau Makan di luar.
- **Makan** (`/makan`) — tiga konteks: Catat (foto + Nutrition Intelligence), Restoran (menu Indonesia tanpa foto), dan Kebiasaan (quick add + pola 28 hari), plus riwayat makan hari ini.
- **Progress** (`/progress`) — Ringkasan, Tubuh (check-in, riwayat, grafik, dan avatar skematis), Fitness, dan Mingguan (weekly review + AI summary). Tautan lama `?tab=weight` membuka Tubuh.
- **Profil** (`/settings`) — "Program Saya": Program & target, Data tubuh, Aktivitas & fitness, Integrasi, Akun.

Rencana harian (`/plan`, pilih Intermittent Fasting atau Defisit Kalori berdasarkan jam bangun) diakses kontekstual dari Home, bukan sebagai tab tersendiri.

## Personal Adaptive Coach

Tersedia langsung di **Home**:

- Menggabungkan status kalori dan protein hari ini, budget mingguan, tren berat, goal aktif, serta Habit Intelligence 28 hari.
- Pengguna dapat memberi konteks langsung: lapar, sangat lapar, craving, atau makan di luar.
- Maksimal tiga prioritas ditentukan oleh engine TypeScript lokal dan selalu disertai dasar data.
- Menu kebiasaan hanya digunakan untuk personalisasi saat data sudah cukup.
- Coach dapat mengarahkan ke Satiety Intelligence, Restaurant Intelligence, Habit quick add, rencana harian, atau grafik berat.
- Menu yang melebihi sisa budget tidak dilarang; aplikasi menjelaskan pilihan porsi dan trade-off-nya.
- Penurunan berat yang terlalu cepat memicu saran untuk tidak menambah defisit.
- Tingkat personalisasi ditampilkan sebagai awal, sedang, atau tinggi berdasarkan kesiapan pola dan tren berat.

## Nutrition Intelligence

Tersedia di tab **Makan → Catat**, mode "Butuh rekomendasi", menyediakan:

- Hunger mode: lapar, manis, gurih, renyah, comfort food, atau cepat dibuat.
- Objective filters: volume besar, protein tinggi, serat tinggi, kalori tipis, dan vegetarian.
- Pantry input berupa daftar bahan yang tersedia.
- Deterministic ranking dari food library lokal.
- **Fullness Score 1–5** berdasarkan kombinasi volume, protein, serat, dan kepadatan energi.
- Target meal budget berdasarkan sisa kalori dan protein hari itu.
- Penjelasan “kenapa ini disarankan?”.
- Gemini recap opsional dengan tepat tiga saran praktis.

Fullness Score adalah heuristik produk, bukan pengukuran klinis. Rekomendasi tidak dimaksudkan untuk diagnosis atau terapi medis.

## Restaurant Intelligence

Tersedia di **Makan → Restoran**:

- Pencarian teks untuk menu warteg, rumah makan Padang, ayam, bakso/mi, soto, fast food, dan kafe.
- Estimasi kalori dan makro dari library lokal, bukan keputusan Gemini.
- Ranking berdasarkan sisa kalori, sisa protein, fullness, goal aktif, kategori, dan kecocokan pencarian.
- Koreksi porsi `0.5x`, `0.75x`, `1x`, atau `1.25x` sebelum disimpan.
- Asumsi porsi dan ketidakpastian ditampilkan secara transparan.

## Habit Intelligence

Tersedia di **Makan → Kebiasaan**:

- Menganalisis rolling 28 hari tanpa menyimpan profil kebiasaan baru di luar log yang sudah ada.
- Menu masuk quick add setelah muncul minimal dua kali.
- Nilai quick add memakai rata-rata kalori, protein, karbohidrat, lemak, dan catatan porsi pengguna sendiri.
- Waktu makan dikelompokkan menjadi pagi, siang, sore, malam, dan larut malam sesuai timezone user.
- Insight pola baru aktif setelah minimal 10 hari tercatat dan 20 makanan.
- Insight merupakan sinyal penggunaan, bukan bukti sebab-akibat atau diagnosis.

## Arsitektur keputusan

```text
Data harian + Settings + Goal + Habit history + User context
                              ↓
Deterministic TypeScript engines
                              ↓
Ranked decision + evidence + next action
                              ↓
Gemini explanation (manual only)
```

Gemini tidak menjadi sumber logika utama. Engine lokal menghitung ranking, score, remaining calories, remaining protein, pola kebiasaan, trade-off, dan safety constraints terlebih dahulu.

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
| `USER3_NAME` | nama user ketiga, opsional |
| `USER3_PASSWORD` | mengaktifkan slot user ketiga, opsional |
| `USER3_HEALTH_SYNC_TOKEN` | token Apple Shortcuts user ketiga, opsional |
| `GEMINI_API_KEY` | API key dari Google AI Studio |
| `GEMINI_MODEL` | opsional, default `gemini-2.5-flash` |
| `UPSTASH_REDIS_REST_URL` | URL Redis dari Upstash/Vercel |
| `UPSTASH_REDIS_REST_TOKEN` | token Redis dari Upstash/Vercel |

Setiap user harus memakai password dan Health Sync token yang berbeda; duplikasi kredensial ditolak agar login/sync tidak memilih akun yang salah. Mengosongkan password menonaktifkan slot tersebut; identitas `u1`, `u2`, dan `u3` tetap stabil.

Untuk local development gunakan `.env.local`. Untuk production isi melalui Vercel Project Settings → Environment Variables.

## Menjalankan lokal

```bash
npm ci
npm run dev
```

Sanity check sebelum merge/deploy:

```bash
npm test
npm run typecheck
npm run build
```

## Model energi dan kelengkapan catatan (Sprint 11)

- Target harian adalah **asupan makan**. Sisa budget = target − asupan; kalori aktivitas tidak dikurangkan dan tidak otomatis menjadi tambahan makanan. Estimasi maintenance sudah memasukkan aktivitas rutin.
- Active Energy tetap disimpan dan ditampilkan sebagai konteks terpisah. Tidak ada saran olahraga berdurasi tertentu untuk menebus surplus.
- Catatan makan memiliki status belum dicatat, parsial, atau lengkap. Konfirmasi seluruh asupan di Home atau per tanggal pada Progress → Mingguan. Menambah/menghapus makanan membuka kembali status; mengubah aktivitas tidak.
- Data lama tanpa `foodLogComplete` tetap tersimpan dan dianggap parsial, bukan asupan nol atau otomatis lengkap. Tidak ada reset data atau perubahan target tersimpan. Interpretasi budget berubah dari net menjadi intake.
- Rata-rata mingguan hanya memakai hari yang dikonfirmasi lengkap, dengan jumlah hari sumber terlihat. Tanpa hari lengkap hasilnya belum ada data (`null`), bukan nol.
- Budget rolling 7 hari memakai semua asupan yang sudah dicatat dan berlabel sementara bila belum seluruh hari lengkap. Nilai tersisa bukan estimasi defisit atau bonus makan.
- Streak menghitung hari pencatatan lengkap berturut-turut sampai kemarin, bukan hari defisit. Rentang feedback 80–100% target merupakan heuristik produk, bukan batas kecukupan medis. Asupan lebih rendah tidak otomatis dinilai lebih baik.
- Ringkasan AI model lama tidak ditampilkan sebagai ringkasan model baru; data lama tetap tersimpan. Buat ulang ringkasan bila diperlukan.

`npm test` menjalankan regression tests engine, handler API, dan middleware dengan adapter penyimpanan in-memory. Tes tersebut tidak membuktikan koneksi Upstash atau Gemini asli. Validasi integrasi nyata memerlukan konfigurasi layanan tersebut.

`npm run test:browser` membangun aplikasi dan menguji UI melalui Chromium dengan Redis REST adapter sintetis serta kredensial uji sementara. Chromium harus tersedia di `/usr/bin/chromium`, atau atur `PLAYWRIGHT_EXECUTABLE_PATH`. Tes mencakup layar mobile/desktop, koreksi/hapus, avatar, navigasi, dan error/empty state; screenshot data uji disimpan di `.next/validation/`. Tes tidak memakai atau mengubah database asli.

## Body Metrics & Progress (Sprint 12)

- Catat berat, lingkar pinggang, pinggul, paha, dan body fat di Progress → Tubuh. Semua kolom opsional; minimal satu ukuran diperlukan.
- Riwayat bertanggal memakai satu baris per tanggal, dengan sumber dan waktu simpan per ukuran. Koreksi hanya kolom yang diubah; kolom kosong tidak menghapus data. Hapus dilakukan secara eksplisit per ukuran.
- Tinggi referensi melekat pada setiap ukuran untuk menjaga interpretasi historis. Catatan hari ini dapat memakai tinggi Profil; catatan lampau tidak menebak tinggi dari Profil saat ini. Catatan lama tetap tersedia, tetapi BMI/WHtR belum dihitung bila referensi tingginya belum ada.
- Rasio memakai ukuran pada tanggal yang sama. Tidak memasangkan pinggang baru dengan pinggul atau paha lama. BMI memakai tinggi referensi berat; WHtR memakai tinggi referensi pinggang.
- Avatar 2D bersifat ilustratif dan bisa disembunyikan. Pinggang/pinggul/paha memengaruhi bagian terkait bila tinggi referensinya tersedia dan konsisten. BMI tidak menentukan bentuk. Bagian tanpa ukuran memakai garis putus-putus; tanpa referensi tinggi tampil sebagai diagram titik ukur tanpa skala.
- Grafik memakai tanggal kalender, titik pengukuran, tabel alternatif, dan rata-rata berat kalender 7 hari bila tersedia minimal dua sampel. Tidak menghubungkan tanggal yang kosong. Perubahan angka bukan otomatis sukses/gagal.
- Pengingat pinggang mingguan serta pinggul/paha dua mingguan opsional, dan bisa disembunyikan. Ukur pada posisi, sisi, serta kondisi yang konsisten.
- Data berat lama dan Apple Health tetap terintegrasi. Sinkronisasi berat saja mempertahankan body fat yang sudah ada. Body fat juga dapat dikirim sendiri, tanpa berat, dan tersedia di Fitness dengan tanggal/sumbernya.
- Belum ada analisis hubungan energi–tubuh atau Adaptive TDEE; fitur tersebut tetap Sprint 13–14. Avatar tidak memperkirakan struktur rangka, massa otot, atau lemak visceral.

## Apple Health Sync

Ini web app, jadi HealthKit **tidak bisa** dibaca langsung dari browser — tidak ada
API web untuk HealthKit, dan tidak ada tombol "Connect Apple Health" yang mungkin
dibuat dari sisi web (beda dengan Google Fit/Strava yang punya REST API). Satu-satunya
jembatan yang tersedia adalah **Apple Shortcuts**, yang jalan sebagai automation di
HP dan POST snapshot ke `/api/health-sync`.

`/api/health-sync` menerima kombinasi field apa pun berikut — semuanya opsional,
kirim yang berhasil kamu baca dari Health saja (mis. tanpa Apple Watch, `vo2Max` dan
`restingHeartRate` memang tidak akan ada):

```json
{
  "calories": 450,
  "weightKg": 81.8,
  "bodyFatPercent": 24.2,
  "vo2Max": 38.5,
  "restingHeartRate": 62,
  "cardioMinutesWeekly": 90
}
```

Setiap field **menimpa** nilai sebelumnya (bukan menumpuk), dan field yang tidak
dikirim di satu sync **tidak menghapus** nilai yang sudah tersimpan dari sync
sebelumnya — jadi automation boleh gagal membaca satu-dua metrik tanpa merusak yang
lain. `calories` dan `weightKg` dan `bodyFatPercent` masuk ke catatan hari itu (kalori
keluar & berat badan); `vo2Max`, `restingHeartRate`, `cardioMinutesWeekly` masuk ke
Settings sebagai nilai terbaru.

### Setup Shortcuts (satu automation untuk semua)

1. Buka app **Shortcuts** → tab **Automation** → **+** → **Create Personal
   Automation** → pilih trigger (misalnya **Time of Day**, jalan tiap pagi/malam,
   atau **App** saat buka app tertentu) → matikan **Ask Before Running**.
2. Untuk tiap metrik yang mau disinkron, tambahkan pasangan action **Find Health
   Samples where** (pilih tipe data + rentang tanggal) lalu **Calculate
   Statistics** (Sum/Average/Latest sesuai kebutuhan), simpan hasilnya sebagai
   variable:

   | Metrik | Tipe Health | Rentang | Statistik |
   |---|---|---|---|
   | `calories` | Active Energy | Start Date is Today | Sum |
   | `weightKg` | Body Mass | Start Date is Today (atau 7 hari terakhir) | Latest/Average |
   | `bodyFatPercent` | Body Fat Percentage | sama seperti Body Mass | Latest/Average |
   | `vo2Max` | VO2 Max | 7–30 hari terakhir | Latest |
   | `restingHeartRate` | Resting Heart Rate | Start Date is Today | Average |
   | `cardioMinutesWeekly` | Workout Duration (filter kardio) atau Exercise Minutes | 7 hari terakhir | Sum |

   Kalau suatu metrik tidak ada datanya (mis. tidak pakai Apple Watch), lewati saja
   pasangan action-nya — tidak perlu dipaksakan.
3. Tambahkan action **Dictionary**, isi key-key di atas dengan variable yang sesuai
   (hapus key yang datanya tidak tersedia).
4. Tambahkan action **Get Contents of URL**:
   - URL: `https://<domain-vercel-kamu>/api/health-sync`
   - Method: `POST`
   - Headers: `Authorization: Bearer <USER_HEALTH_SYNC_TOKEN milikmu>`
   - Request Body: **JSON**, isi dengan Dictionary dari langkah 3
5. Simpan. Tiap automation ini jalan, Settings/Progress/Weight otomatis ter-update
   sesuai metrik yang berhasil dibaca.

Kalau tidak mau ribet setup semua sekaligus, mulai dari `calories` saja (paling
simpel, 1 pasang action) lalu tambah metrik lain belakangan — endpoint yang sama
menerima payload sebagian.

## Prinsip keselamatan produk

- Tidak mendorong puasa kompensasi, muntah, atau olahraga sebagai hukuman.
- Very lean mode tidak mengejar body-fat serendah mungkin.
- VO₂ max dan body fat dari wearable/smart scale dianggap estimasi perangkat.
- Gemini dilarang mengarang makanan, aktivitas, diagnosis, usia, jenis kelamin, atau riwayat medis.
- Habit Intelligence tidak menyimpulkan pola terlalu dini dan tidak mengklaim hubungan sebab-akibat.
- Personal Adaptive Coach tidak otomatis memperketat defisit dan tidak melarang makanan berdasarkan satu hari.
- Perubahan target penting tetap memerlukan persetujuan user.

## Product roadmap

Lihat [`ROADMAP.md`](./ROADMAP.md). Fase integrasi Sprint 7–10 telah selesai.

## Batasan saat ini

- Maksimal tiga user, bukan sistem registrasi umum.
- Foto makanan tidak disimpan.
- Estimasi foto, menu restoran, MET, VO₂ max, body fat, Fullness Score, dan ETA berat adalah perkiraan.
- Habit Intelligence dan Adaptive Coach bergantung pada konsistensi dan kualitas catatan pengguna.
- Konteks lapar/craving dipilih manual dan tidak disimpan sebagai diagnosis atau profil psikologis.
- Health sync masih melalui Shortcuts, bukan aplikasi iOS native.

## Body Response (Sprint 13)

Progress → Ringkasan menyediakan periode 14/28/56 hari untuk asupan, protein, aktivitas, berat, dan pinggang. Setiap metrik menampilkan coverage, alasan kesiapan, grafik bertanggal selaras, serta tabel alternatif. Asupan parsial tidak masuk rata-rata; aktivitas Apple Health tidak ditambahkan lagi ke aktivitas manual pada hari yang sama. Insight bersifat deskriptif dan tidak mengubah target. Aturan sampel, outlier, dan sumber ada pada [kebijakan data](docs/body-response-data-policy.md). Sprint 14 menambahkan evaluasi target dengan persetujuan pengguna.

## Evaluasi target & coach (Sprint 14)

Home memakai kesiapan tren tubuh untuk prioritas coach. Progress → Ringkasan menyediakan estimasi maintenance/rentang dan usulan target setelah minimal 26 hari asupan lengkap serta 12 ukuran berat dalam 28 hari yang sudah selesai. Aktivitas tidak dihitung lagi. Pilihan **terapkan** memerlukan peninjauan konteks; pilihan **tetap** mempertahankan target. Server menghitung ulang sebelum menyimpan dan kedua pilihan memberi jeda evaluasi 28 hari. Protein tetap. Detail dan batasan ada pada [kebijakan kalibrasi](docs/calibration-data-policy.md). Integrasi EVAL Upstash nyata masih perlu diverifikasi setelah database dikonfigurasi.

## Pemeriksaan integrasi nyata

Setelah credential lokal tersedia dan aplikasi berjalan, jalankan `node scripts/check-live-integration.cjs`. Helper hanya mengakses aplikasi lokal, memeriksa Redis serta Lua compare-and-set pada key sementara, lalu login dan membaca API untuk setiap pengguna aktif. Data makan, tubuh, dan target pengguna asli tidak diubah. Key sementara dibersihkan setelah tes; hasil cleanup dilaporkan. Jangan jalankan helper bersamaan dengan build. Credential diisi melalui environment settings atau `.env.local` yang diabaikan Git, bukan melalui argumen command atau file tracked. Gemini dan Health Sync belum dicakup oleh helper ini.
