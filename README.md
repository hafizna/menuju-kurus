# Slothly

> Sehat pelan-pelan, tanpa drama. (Nama repo masih `menuju-kurus`.)

Aplikasi personal untuk calorie tracking, weight management, fitness intelligence, dan keputusan makan sehari-hari. Dibuat mobile-first dengan Next.js, Gemini + DeepSeek, Upstash Redis, dan Vercel free tier.

Slothly diposisikan sebagai **personal nutrition decision assistant**: logika lokal menentukan keputusan, sedangkan AI hanya menjelaskan hasil yang sudah dihitung.

Tampilan **Rumah Kukang** memakai ilustrasi kanopi dan maskot SVG orisinal, dengan flow Catat → cek porsi → simpan → review harian/mingguan. Makanan yang sudah tersimpan bisa dibuka lagi dari riwayat Makan, per hari untuk 7 hari terakhir, untuk melihat rincian bahan dan mengoreksi jumlah, protein, nama, atau jam; keterangan seperti "telur 3 butir" bisa dihitung ulang oleh AI tanpa foto. Tanpa foto, **Tulis & hitung** menghitung makanan dari tulisan dengan ukuran baku (centong, butir, gelas) yang sama untuk semua orang. Detail draft, kesiapan data, motion, dan perilaku penyimpanan ada di [panduan Rumah Kukang](docs/rumah-kukang.md).

## Fitur utama

1. **Foto makanan → estimasi kalori dan makro.** Foto diproses in-memory, dikirim ke Gemini, lalu dibuang. Hanya hasil teks yang disimpan.
2. **Daily calorie tracking.** Catat makanan dan kalori keluar secara manual atau lewat Apple Shortcuts untuk Active Energy.
   Gula tambahan (gula, kental manis, sirup, minuman manis; bukan gula alami buah atau susu) ikut dicatat sebagai sinyal kebiasaan: dari foto per komponen, dari tombol cepat, atau diisi manual. Datanya opsional dan yang belum diketahui tidak pernah dihitung 0 g. Home menampilkan total hari ini dan rata-rata 7 hari terakhir dari hari yang gulanya tercatat lengkap, dengan patokan sampai 50 g, bukan batas keras.
3. **Weight Intelligence.** Log berat, rata-rata 7/14 hari, weekly rate, grafik, target berat, dan ETA menuju target.
4. **Health Score & Weekly Budget.** Menggabungkan kalori, protein, tren berat, aktivitas, dan konsistensi.
5. **Personal Adaptive Coach & Recovery Mode.** Meranking fokus berikutnya dari status hari ini, budget mingguan, tren berat, pola 28 hari, dan konteks lapar/craving/makan di luar—tanpa puasa kompensasi atau olahraga sebagai hukuman.
6. **Fitness Intelligence.** Goal profile `weight_loss`, `very_lean`, `athletic`, atau `muscle_gain`, disertai VO₂ max, resting heart rate, cardio minutes, strength days, goal score, dan recap AI opsional. Dari riwayat Apple Health, tab Fitness juga membaca komposisi tubuh (massa lemak dan massa bebas lemak, estimasi), tren detak istirahat dan VO₂ max, serta kesegaran datanya; lihat [kebijakan](docs/body-response-data-policy.md#komposisi-tubuh-dan-tren-fitness).
7. **Nutrition Intelligence / Satiety Intelligence.** Menjawab “apa keputusan makan terbaik saat ini?” berdasarkan sisa kalori, sisa protein, goal, craving, objective, dan bahan yang tersedia.
8. **Habit Intelligence.** Pelajari menu berulang dan waktu makan dalam rolling 28 hari, lalu quick add dari rata-rata catatan pengguna sendiri.
9. **AI recap manual.** Gemini (foto makanan dan, secara default, recap teks) hanya dipanggil saat user menekan tombol, agar penggunaan tetap terkontrol. Tanpa kunci AI sama sekali, recap memakai template gratis.
10. **Hingga lima user terpisah.** Satu deployment dapat dipakai hingga lima orang, masing-masing dengan login sendiri (kode undangan dari admin + PIN 6 digit buatan sendiri), settings, Redis keys, dan Health Sync token terpisah.

## Navigasi

Empat tab di bottom nav, disusun sebagai alur keputusan harian, bukan daftar fitur:

- **Home** (`/`) — status hari ini dan Personal Adaptive Coach dengan konteks Sekarang, Lapar, Sangat lapar, Craving, atau Makan di luar.
- **Makan** (`/makan`) — tiga konteks: Catat (foto, tulis & hitung, atau isi manual), Ide makan (saran dari Satiety Intelligence), dan Favorit (quick add + pola 28 hari), plus riwayat makan per hari. Alamat lama `/makan/restaurant` mengarah ke Ide makan.
- **Progress** (`/progress`) — tiga tab menurut pertanyaannya. **Ringkasan**: review 7 hari dengan ringkasan AI dan fokus mingguan, lalu pola jangka panjang dan evaluasi target. **Tubuh**: pencatatan ukuran, perubahan, body fat dan komposisi, riwayat, grafik, dan avatar skematis. **Kebugaran**: VO₂ max, detak istirahat, serta kardio dan latihan beban dari catatan Gerak hari ini. Tautan lama `?tab=weight` membuka Tubuh dan `?tab=weekly` membuka Ringkasan.
- **Profil** (`/settings`) — "Program Saya": Program & target, Data tubuh, Aktivitas & fitness, Integrasi, Akun.

Rencana harian (`/plan`, pilih Intermittent Fasting atau Defisit Kalori berdasarkan jam bangun) diakses kontekstual dari Home, bukan sebagai tab tersendiri.

## Personal Adaptive Coach

Tersedia langsung di **Home**:

- Menggabungkan status kalori dan protein hari ini, budget mingguan, tren berat, goal aktif, serta Habit Intelligence 28 hari.
- Pengguna dapat memberi konteks langsung: lapar, sangat lapar, craving, atau makan di luar.
- Maksimal tiga prioritas ditentukan oleh engine TypeScript lokal dan selalu disertai dasar data.
- Menu kebiasaan hanya digunakan untuk personalisasi saat data sudah cukup.
- Coach dapat mengarahkan ke Satiety Intelligence, Tulis & hitung, Habit quick add, rencana harian, atau grafik berat.
- Menu yang melebihi sisa budget tidak dilarang; aplikasi menjelaskan pilihan porsi dan trade-off-nya.
- Penurunan berat yang terlalu cepat memicu saran untuk tidak menambah defisit.
- Tingkat personalisasi ditampilkan sebagai awal, sedang, atau tinggi berdasarkan kesiapan pola dan tren berat.

## Nutrition Intelligence

Tersedia di tab **Makan → Ide makan**, menyediakan:

- Hunger mode: lapar, manis, gurih, renyah, comfort food, atau cepat dibuat.
- Objective filters: volume besar, protein tinggi, serat tinggi, kalori tipis, dan vegetarian.
- Pantry input berupa daftar bahan yang tersedia.
- Deterministic ranking dari food library lokal.
- **Fullness Score 1–5** berdasarkan kombinasi volume, protein, serat, dan kepadatan energi.
- Target meal budget berdasarkan sisa kalori dan protein hari itu.
- Penjelasan “kenapa ini disarankan?”.
- Recap AI opsional (DeepSeek) dengan tepat tiga saran praktis.

Fullness Score adalah heuristik produk, bukan pengukuran klinis. Rekomendasi tidak dimaksudkan untuk diagnosis atau terapi medis.

## Habit Intelligence

Tersedia di **Makan → Favorit**:

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
AI explanation (manual only — Gemini untuk vision, DeepSeek untuk teks)
```

AI (Gemini maupun DeepSeek) tidak menjadi sumber logika utama. Engine lokal menghitung ranking, score, remaining calories, remaining protein, pola kebiasaan, trade-off, dan safety constraints terlebih dahulu.

## Stack

- Next.js 16 App Router + Tailwind CSS (middleware.ts masih dipakai — deprecated di 16 tapi belum dihapus, lihat catatan di `middleware.ts`)
- Vercel Hobby/free plan
- Google Gemini API untuk analisa foto makanan (vision), default `gemini-2.5-flash`
- DeepSeek API (OpenAI-compatible) untuk AI recap teks-only: weekly summary, fitness recap, satiety recap
- Upstash Redis REST API
- HMAC session cookie; login kode undangan sekali pakai + PIN harian (hashed, scrypt)
- Apple Shortcuts sebagai bridge ke Apple Health

## Dua provider AI, dua peran berbeda

Gemini adalah provider utama; DeepSeek hanya cadangan opsional (berbayar, tidak diperlukan):

- **Gemini**: satu-satunya yang punya model vision, jadi dipakai untuk analisa foto makanan (`lib/gemini.ts`). Free tier Google AI Studio sudah cukup, tanpa kredit. Secara default Gemini juga menjalankan 3 panggilan teks-only: weekly summary (`lib/weeklySummaryAi.ts`), fitness recap (`lib/fitnessSummaryAi.ts`), dan satiety recap (`lib/satietyAi.ts`).
- **DeepSeek**: cadangan opsional untuk 3 panggilan teks-only di atas (prepaid, tidak punya model vision). Dipakai hanya bila `GEMINI_API_KEY` kosong atau `TEXT_AI_PROVIDER=deepseek`.

Konsekuensi teknis: DeepSeek tidak punya constraint `responseSchema` seketat Gemini (cuma jaminan "valid JSON", bukan jaminan bentuk field tertentu), jadi `lib/deepseekClient.ts` menambahkan instruksi bentuk JSON eksplisit di system prompt sebagai gantinya.

Pemilihan provider recap teks ada di `lib/textAi.ts`: Gemini bila `GEMINI_API_KEY` terisi (free tier Google AI Studio, tanpa kredit; batasnya per proyek dan dilihat di konsol AI Studio), DeepSeek bila hanya itu yang terisi, dan `TEXT_AI_PROVIDER` bisa memaksa salah satunya. Prompt recap fitness dan mingguan menerima `signals` hasil hitung server (komposisi tubuh, tren detak istirahat dan VO₂ max) sehingga model menjelaskan angka yang sudah ada dan tidak menghitung sendiri. Pada free tier Google dapat memakai prompt untuk meningkatkan produknya; isi prompt memuat angka tubuh dan kebugaran tetapi tanpa nama atau identitas akun.

Semua panggilan AI (baik Gemini maupun DeepSeek) tetap manual — hanya jalan saat tombol "Buat recap"/"Buat ringkasan" ditekan, bukan otomatis saat halaman dibuka.

### Tanpa kunci AI: fallback template tanpa biaya

Kunci AI untuk recap teks boleh kosong sepenuhnya — cocok untuk fase testing dengan
user non-paying. Tanpa `GEMINI_API_KEY` dan `DEEPSEEK_API_KEY`, `lib/weeklySummaryAi.ts`, `lib/fitnessSummaryAi.ts`,
dan `lib/satietyAi.ts` otomatis memakai fallback template deterministik:
kalimat dirangkai dari angka/data yang sudah dihitung engine lokal (bukan
dari model AI sama sekali), jadi tombol "Buat recap" tetap berfungsi dan
nggak ada biaya sama sekali. UI menandai hasil ini sebagai "Ringkasan
Otomatis"/"Recap Otomatis" (bukan "AI") supaya jelas bedanya. Begitu
`GEMINI_API_KEY` (atau `DEEPSEEK_API_KEY`) tersedia, ketiga fitur otomatis pindah
ke model beneran tanpa perlu ubah kode. Foto makanan selalu lewat Gemini dan
membutuhkan `GEMINI_API_KEY`.

## Login: kode undangan + PIN

Tidak ada registrasi terbuka. Admin (kamu) menentukan siapa yang boleh masuk lewat env var; tiap orang membuat PIN sendiri.

1. Admin mengisi `USERn_INVITE_CODE` (acak dan panjang, mis. `openssl rand -hex 8`) di Vercel, lalu redeploy, dan mengirim kodenya ke orangnya. `USERn_NAME` boleh dikosongkan: nama panggilan ditanyakan saat onboarding dan bisa diganti di Profil.
2. Orang itu buka `/login` → "Punya kode undangan" → memasukkan kode → membuat PIN 6 digit di `/account/set-pin`. PIN disimpan **ter-hash** (scrypt + salt per user) di Redis.
3. Setelah PIN ada, kode undangan tidak berlaku lagi untuk masuk; login sehari-hari cukup PIN. Percobaan PIN/kode dibatasi per IP (10 kali / 10 menit).
4. Ganti PIN: Profil → Akun → "Ubah PIN".
5. **Lupa PIN**: hapus key `mk:uN:pin` di Upstash (Data Browser), maka kode undangan slot itu berlaku lagi dan user bisa membuat PIN baru.

Mencabut akses = kosongkan `USERn_INVITE_CODE` lalu redeploy (sesi lama otomatis ditolak). Google Sign-In sempat dibuat lalu dicabut demi kesederhanaan; riwayatnya ada di git (commit `0029b0d`).

## Environment variables

| Variable | Keterangan |
|---|---|
| `SESSION_SECRET` | string acak panjang untuk tanda tangan cookie |
| `USER1_NAME` | opsional; nama cadangan sampai user mengisi nama panggilannya sendiri di onboarding |
| `USER1_INVITE_CODE` | kode undangan sekali pakai user pertama; mengaktifkan slot |
| `USER1_HEALTH_SYNC_TOKEN` | token rahasia buatan sendiri untuk Apple Shortcuts |
| `USER2_NAME` | opsional, kosongkan bila hanya satu user |
| `USER2_INVITE_CODE` | opsional |
| `USER2_HEALTH_SYNC_TOKEN` | opsional |
| `USER3_NAME` .. `USER5_NAME` | nama user ke-3/4/5, opsional |
| `USER3_INVITE_CODE` .. `USER5_INVITE_CODE` | mengaktifkan slot user ke-3/4/5, opsional |
| `USER3_HEALTH_SYNC_TOKEN` .. `USER5_HEALTH_SYNC_TOKEN` | token Apple Shortcuts user ke-3/4/5, opsional |
| `GEMINI_API_KEY` | API key dari Google AI Studio (free tier, tanpa kredit) — wajib untuk foto makanan, dan otomatis dipakai juga untuk recap teks |
| `GEMINI_MODEL` | opsional, default `gemini-2.5-flash` |
| `DEEPSEEK_API_KEY` | API key dari platform.deepseek.com (prepaid), opsional dan tidak diperlukan — dipakai untuk recap teks hanya bila `GEMINI_API_KEY` kosong atau `TEXT_AI_PROVIDER=deepseek` |
| `TEXT_AI_PROVIDER` | opsional, `gemini` atau `deepseek`; memaksa provider recap teks bila kedua kunci ada. Default: Gemini lebih dulu |
| `DEEPSEEK_MODEL` | opsional, default `deepseek-chat` |
| `UPSTASH_REDIS_REST_URL` | URL Redis dari Upstash/Vercel |
| `UPSTASH_REDIS_REST_TOKEN` | token Redis dari Upstash/Vercel |

Setiap user harus memakai kode undangan dan Health Sync token yang berbeda; duplikasi ditolak agar login/sync tidak memilih akun yang salah. Mengosongkan `USERn_INVITE_CODE` menonaktifkan slot tersebut; identitas `u1`-`u5` tetap stabil, dan PIN yang sudah pernah dibuat tetap tersimpan di Redis kalau slot diaktifkan lagi. Maksimal 5 slot (`USER1_*`..`USER5_*`).

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
- Catatan makan memiliki status belum dicatat, parsial, atau lengkap. Konfirmasi seluruh asupan di Home atau per tanggal pada Progress → Ringkasan → Rincian per hari. Menambah/menghapus makanan membuka kembali status; mengubah aktivitas tidak.
- Data lama tanpa `foodLogComplete` tetap tersimpan dan dianggap parsial, bukan asupan nol atau otomatis lengkap. Tidak ada reset data atau perubahan target tersimpan. Interpretasi budget berubah dari net menjadi intake.
- Rata-rata mingguan hanya memakai hari yang dikonfirmasi lengkap, dengan jumlah hari sumber terlihat. Tanpa hari lengkap hasilnya belum ada data (`null`), bukan nol.
- Budget rolling 7 hari memakai semua asupan yang sudah dicatat dan berlabel sementara bila belum seluruh hari lengkap. Nilai tersisa bukan estimasi defisit atau bonus makan.
- Streak menghitung hari pencatatan lengkap berturut-turut sampai kemarin, bukan hari defisit. Rentang feedback 80–100% target merupakan heuristik produk, bukan batas kecukupan medis. Asupan lebih rendah tidak otomatis dinilai lebih baik.
- Ringkasan AI model lama tidak ditampilkan sebagai ringkasan model baru; data lama tetap tersimpan. Buat ulang ringkasan bila diperlukan.

`npm test` menjalankan regression tests engine, handler API, dan middleware dengan adapter penyimpanan in-memory. Tes tersebut tidak membuktikan koneksi Upstash, Gemini, atau DeepSeek asli. Validasi integrasi nyata memerlukan konfigurasi layanan tersebut.

`npm run test:browser` membangun aplikasi dan menguji UI melalui Chromium dengan Redis REST adapter sintetis serta kredensial uji sementara. Chromium harus tersedia di `/usr/bin/chromium`, atau atur `PLAYWRIGHT_EXECUTABLE_PATH`. Tes mencakup layar mobile/desktop, koreksi/hapus, avatar, navigasi, dan error/empty state; screenshot data uji disimpan di `.next/validation/`. Tes tidak memakai atau mengubah database asli.

## Body Metrics & Progress (Sprint 12)

- Catat berat, lingkar pinggang, pinggul, paha, dan body fat di Progress → Tubuh. Semua kolom opsional; minimal satu ukuran diperlukan.
- Riwayat bertanggal memakai satu baris per tanggal, dengan sumber dan waktu simpan per ukuran. Koreksi hanya kolom yang diubah; kolom kosong tidak menghapus data. Hapus dilakukan secara eksplisit per ukuran.
- Tinggi referensi melekat pada setiap ukuran untuk menjaga interpretasi historis. Catatan hari ini dapat memakai tinggi Profil; catatan lampau tidak menebak tinggi dari Profil saat ini. Catatan lama tetap tersedia, tetapi BMI/WHtR belum dihitung bila referensi tingginya belum ada.
- Rasio memakai ukuran pada tanggal yang sama. Tidak memasangkan pinggang baru dengan pinggul atau paha lama. BMI memakai tinggi referensi berat; WHtR memakai tinggi referensi pinggang.
- Avatar 2D bersifat ilustratif dan bisa disembunyikan. Pinggang/pinggul/paha memengaruhi bagian terkait bila tinggi referensinya tersedia dan konsisten. BMI tidak menentukan bentuk. Bagian tanpa ukuran memakai garis putus-putus; tanpa referensi tinggi tampil sebagai diagram titik ukur tanpa skala.
- Grafik memakai tanggal kalender, titik pengukuran, tabel alternatif, dan rata-rata berat kalender 7 hari bila tersedia minimal dua sampel. Tidak menghubungkan tanggal yang kosong. Perubahan angka bukan otomatis sukses/gagal.
- Pengingat pinggang mingguan serta pinggul/paha dua mingguan opsional, dan bisa disembunyikan. Ukur pada posisi, sisi, serta kondisi yang konsisten.
- Data berat lama dan Apple Health tetap terintegrasi. Sinkronisasi berat saja mempertahankan body fat yang sudah ada. Body fat juga dapat dikirim sendiri, tanpa berat, dan tersedia di Tubuh dengan tanggal/sumbernya.
- Belum ada analisis hubungan energi–tubuh atau Adaptive TDEE; fitur tersebut tetap Sprint 13–14. Avatar tidak memperkirakan struktur rangka, massa otot, atau lemak visceral.

## Apple Health Sync

Buka **Profil → Data kesehatan → Hubungkan Apple Health** untuk memasang
**Slothly Berat v2** dan **Slothly Watch v2**. Unduhan bertanda tangan bersifat
generik dan tidak meminta isian konfigurasi. Setelah memasang, pilih
**Hubungkan lewat Slothly Berat** atau **Hubungkan lewat Slothly Watch** sekali
di iPhone. Tombol membuka Shortcut langsung dengan kode sekali pakai; browser
tidak menerima Bearer token dan tidak ada konfigurasi yang perlu disalin.

Shortcut menukar kode ke server Slothly, menampilkan nama akun terverifikasi
untuk persetujuan, menguji koneksi, lalu menyimpan koneksi pribadi di
`Shortcuts/Slothly/connection.json`. Kedua Shortcut memakai berkas yang sama.
Pasang keduanya jika ingin memakai kedua jenis sinkronisasi, lalu jalankan
masing-masing sekali untuk memberi izin Health sebelum membuat automasi.
Tombol **Buka Slothly Berat/Watch** berikutnya memakai koneksi tersimpan.

- **Berat:** berat badan dan persentase lemak terbaru yang tersedia hari ini.
  Automasi setelah aplikasi timbangan ditutup memerlukan timbangan digital
  dengan aplikasi pendamping yang menulis ke Apple Health. Pengguna memilih
  aplikasi timbangannya sendiri; AFit hanya contoh. Slothly tidak menghubungkan
  Bluetooth timbangan secara langsung.
- **Watch:** VO₂ max terbaru dari jendela 30 hari, detak istirahat dari jendela
  dua hari, dan jumlah kalori aktif hari ini. Panduan automasi tersedia untuk
  setiap hari pukul **21.30**. Data dari Apple Watch atau sumber lain harus
  sudah tersedia di Apple Health.
- Kedua automasi dibuat sendiri di aplikasi Shortcuts. Unduhan tidak membuat
  personal automation. Sinkronisasi tetap dapat dijalankan manual.

**Shortcut buatan sendiri.** Server juga menerima bentuk datar
`{"provider":"apple_health","measuredAt":"…","weightKg":93.4,"bodyFatPercent":28.1}`
dari Shortcut yang dibangun sendiri; panduannya ada di
[docs/health-shortcut-manual.md](docs/health-shortcut-manual.md). Browser tidak
menampilkan token, jadi cara ini hanya untuk token koneksi yang sudah dimiliki.
Dengan `provider` (termasuk Shortcut v2), `vo2Max` dan `restingHeartRate` tersimpan
sebagai data Apple Health beserta riwayat harian untuk tren di tab Kebugaran. Tanpa
`provider`, bentuk lama (hanya mengisi Profil) tetap berlaku.

Kode penghubung berlaku hingga lima menit dan dipakai sekali. Menyiapkan kode tidak
mengubah akses yang sudah bekerja; penukaran kode menambah akses instalasi
baru. **Putuskan koneksi** mencabut seluruh akses dan kode penghubung sebelumnya,
tanpa menghapus pengukuran. Token hanya diterima Shortcut dan disimpan sebagai
hash di server. Berkas koneksi pribadi dapat mengikuti pengaturan iCloud dan
tidak boleh dibagikan.

Templat publik dikunci ke `https://menuju-kurus.vercel.app` untuk penukaran kode
dan pengiriman Health. Deployment lain memerlukan templat yang dibangun dan
ditandatangani untuk origin tersebut. Ekspor pribadi tidak dipublikasikan;
layanan signing hanya menerima templat generik tanpa token, kode, nama akun,
atau pengukuran pribadi. Pemasangan v2, penyimpanan berkas bersama, dan automasi
**masih memerlukan verifikasi pada iPhone fisik**; tes lokal tidak membuktikan
izin maupun eksekusi latar iOS. Lihat [panduan dua Shortcut](docs/native-health-shortcuts.md).

HealthKit dibaca di iPhone, bukan oleh browser. Pengguna tetap memberi izin
per jenis data; iOS dapat menghentikan proses jika akses belum diberikan.
Metrik tanpa sampel dilewati. Unit yang tidak dikenali dihentikan sebelum
nilainya dikirim: gunakan kg, persen, BPM, mL/kg/min, dan kcal sesuai metrik.
Langkah, tidur, dan konektor Android Health Connect belum disertakan.

Permintaan body/fitness memakai
`{provider:"apple_health",samples:[{metric,value,measuredAt}]}` dengan nama metrik
`weightKg`, `bodyFatPercent`, `vo2Max`, dan `restingHeartRate`. Tanggal pengukuran
asli dipertahankan; pengukuran lama tidak menimpa yang lebih baru. Progress →
Kebugaran menampilkan VO₂ max dan denyut istirahat terbaru beserta sumber/tanggal;
isian Profil menjadi cadangan jika belum ada hasil impor. Ini belum berupa
riwayat atau grafik VO₂ max. Kalori aktif harian memakai payload
`{provider:"apple_health",calories:<sum>}` dan mengganti jumlah aktivitas Health
hari itu, bukan menumpuknya.

**Periksa status** membedakan akses akun, uji koneksi, dan pengukuran yang benar-benar
diterima. Status akun tidak membuktikan koneksi telah tersimpan pada iPhone
tertentu. Jika Health sudah berisi data tetapi tidak terbaca, tersedia
[pemeriksaan pembacaan Health](docs/health-read-check.md) yang menampilkan jumlah
dan tanggal sampel secara lokal tanpa mengirim hasil atau nilai berat. Jumlah
nol maupun error native tidak otomatis membuktikan izin ditolak.

### Kompatibilitas Shortcut lama

Shortcut gabungan v5 dan instalasi manual yang sudah tersambung tetap didukung.
Menghubungkan v2 tidak merotasi akses sebelumnya. Untuk pemasangan baru gunakan
v2; [dokumentasi v5](docs/health-shortcut.md) adalah arsip alur sebelumnya dan
kontrol pemasangan manualnya sudah tidak ditampilkan di app.

`/api/health-sync` tetap menerima field datar opsional `calories`, `weightKg`,
`bodyFatPercent`, `vo2Max`, `restingHeartRate`, dan `cardioMinutesWeekly` untuk
instalasi lama. Field yang tidak dikirim tidak menghapus hasil sinkronisasi lain.
Pada kontrak lama, kalori/berat/body fat memakai tanggal kiriman atau hari ini;
VO₂ max, denyut istirahat, dan kardio mingguan memperbarui isian Settings.

## Prinsip keselamatan produk

- Tidak mendorong puasa kompensasi, muntah, atau olahraga sebagai hukuman.
- Very lean mode tidak mengejar body-fat serendah mungkin.
- VO₂ max dan body fat dari wearable/smart scale dianggap estimasi perangkat.
- Gemini dan DeepSeek dilarang mengarang makanan, aktivitas, diagnosis, usia, jenis kelamin, atau riwayat medis.
- Habit Intelligence tidak menyimpulkan pola terlalu dini dan tidak mengklaim hubungan sebab-akibat.
- Personal Adaptive Coach tidak otomatis memperketat defisit dan tidak melarang makanan berdasarkan satu hari.
- Perubahan target penting tetap memerlukan persetujuan user.

## Product roadmap

Lihat [`ROADMAP.md`](./ROADMAP.md). Fase integrasi Sprint 7–10 telah selesai.

## Batasan saat ini

- Maksimal lima user; akses hanya lewat kode undangan dari admin, bukan registrasi publik/terbuka.
- Foto makanan tidak disimpan.
- Estimasi foto dan tulisan makanan, MET, VO₂ max, body fat, Fullness Score, dan ETA berat adalah perkiraan.
- Habit Intelligence dan Adaptive Coach bergantung pada konsistensi dan kualitas catatan pengguna.
- Konteks lapar/craving dipilih manual dan tidak disimpan sebagai diagnosis atau profil psikologis.
- Health sync masih melalui Shortcuts, bukan aplikasi iOS native.

## Body Response (Sprint 13)

Progress → Ringkasan menyediakan periode 14/28/56 hari untuk asupan, protein, aktivitas, berat, dan pinggang. Setiap metrik menampilkan coverage, alasan kesiapan, grafik bertanggal selaras, serta tabel alternatif. Asupan parsial tidak masuk rata-rata; aktivitas Apple Health tidak ditambahkan lagi ke aktivitas manual pada hari yang sama. Insight bersifat deskriptif dan tidak mengubah target. Aturan sampel, outlier, dan sumber ada pada [kebijakan data](docs/body-response-data-policy.md). Sprint 14 menambahkan evaluasi target dengan persetujuan pengguna.

## Evaluasi target & coach (Sprint 14)

Home memakai kesiapan tren tubuh untuk prioritas coach. Progress → Ringkasan menyediakan estimasi maintenance/rentang dan usulan target setelah minimal 26 hari asupan lengkap serta 12 ukuran berat dalam 28 hari yang sudah selesai. Aktivitas tidak dihitung lagi. Pilihan **terapkan** memerlukan peninjauan konteks; pilihan **tetap** mempertahankan target. Server menghitung ulang sebelum menyimpan dan kedua pilihan memberi jeda evaluasi 28 hari. Protein tetap. Detail dan batasan ada pada [kebijakan kalibrasi](docs/calibration-data-policy.md). Integrasi EVAL Upstash nyata masih perlu diverifikasi setelah database dikonfigurasi.

## Pemeriksaan integrasi nyata

Setelah credential lokal tersedia dan aplikasi berjalan, jalankan `node scripts/check-live-integration.cjs`. Helper hanya mengakses aplikasi lokal, memeriksa Redis serta Lua compare-and-set pada key sementara, lalu login dan membaca API untuk setiap pengguna aktif. Data makan, tubuh, dan target pengguna asli tidak diubah. Key sementara dibersihkan setelah tes; hasil cleanup dilaporkan. Jangan jalankan helper bersamaan dengan build. Credential diisi melalui environment settings atau `.env.local` yang diabaikan Git, bukan melalui argumen command atau file tracked. Gemini, DeepSeek, dan Health Sync belum dicakup oleh helper ini.
