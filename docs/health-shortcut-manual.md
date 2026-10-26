# Apple Health → Slothly: Shortcut buatan sendiri

Cara ini membuat Shortcut langsung di iPhone, tanpa unduhan bertanda tangan dan tanpa layanan pihak ketiga. Dipakai bila [Shortcut unduhan](health-shortcut.md) gagal membaca data. Panduan yang sama tersedia di aplikasi: **Profil → Data kesehatan → Hubungkan Apple Health → Buat Shortcut sendiri**.

Status verifikasi: berat dari AFit → Apple Health → Shortcut sederhana → `/api/health-sync` sudah dicoba di iPhone pemilik app (respons `status: "ok"`, `weightKg: true`). Body fat, penanda waktu `measuredAt`, data Apple Watch, dan pemicu otomatis belum diuji di perangkat; tiap bagian di bawah menandainya.

Prasyarat: sumber data (AFit, Apple Watch) menulis ke Apple Health. Cek di Health → Browse → tipe datanya → Data Sources. Shortcut hanya membaca dari Health; ia tidak bisa membuat data yang tidak ada di sana.

## 1. Token

1. Di halaman Hubungkan Apple Health tekan **Siapkan koneksi** (atau **Sambungkan ulang**).
2. Tekan **Salin token saja**, tempel di Catatan. Token hanya tampil sekali: server menyimpan hash-nya. Menutup halaman sebelum menyalin berarti membuat token baru.
3. Bentuknya `slothly.u1.` diikuti 43 karakter `A–Z a–z 0–9 _ -`. Token membolehkan penulisan data ke akunmu; jangan dibagikan. **Sambungkan ulang** membatalkan token lama.

Token `USERn_HEALTH_SYNC_TOKEN` di environment hanya berlaku bila belum pernah ada koneksi dari app; begitu koneksi dibuat, token environment berhenti dipakai (`lib/healthConnection.ts`).

## 2. Shortcut berat dan body fat

Nama: "Slothly Berat". Urutan action (terbukti untuk berat):

```
Find Health Samples
    Type is Weight · Start Date is Today · Unit kg
    Sort by Start Date · Order Latest First · Limit 1
Count Items in Health Samples
If Count is 1
    Get Value from Health Samples
    Get Contents of URL
        URL     https://<domain>/api/health-sync
        Method  POST
        Header  Authorization = Bearer <token>
        Body    JSON
                  weightKg   (Number)  ← hasil Get Value
End If
```

Catatan yang menentukan berhasil atau tidaknya:

- **Limit 1 dan "is 1"**: hasil Find hanya 0 atau 1 sample. "Is 1" cukup; tanpa data hari ini bagian di dalam If dilewati. Bila Limit tertulis 2, Count bisa 2 dan If tidak terpenuhi.
- **Header** satu baris: `Bearer`, satu spasi, token. Tidak ada kutip, tanda `=`, atau kurung sudut. Server membaca header dengan pola `Bearer <token>`; selain itu hasilnya `connection_invalid`.
- **Field Number**: field baru bertipe Number berisi angka `0` bawaan. Hapus angka itu sebelum memasukkan variabel, atau nilai terkirim sebagai `093.4`. Bila Get Value menampilkan `93.4 kg`, tambahkan **Get Numbers from Input**.
- **Izin domain**: saat pertama berjalan iOS menanyakan akses ke domain app; pilih **Allow**.

Uji dengan menambahkan **Show Result** setelah Get Contents of URL. Hasil yang diharapkan:

```json
{ "ok": true, "status": "ok", "received": 1, "ignored": 0,
  "synced": { "weightKg": true, "bodyFatPercent": false, "...": false } }
```

Hapus Show Result sebelum dijadikan automation.

### Waktu ukur asli (disarankan, belum diuji di perangkat)

Tanpa `measuredAt`, data dicatat pada waktu kirim. Filter "Start Date is Today" mencegah salah tanggal; filter "in the last 1 day" tidak, karena sample kemarin malam akan tercatat sebagai hari ini. Agar tercatat pada waktu ukurnya, tambahkan field Text:

| Field | Isi |
|---|---|
| `provider` | `apple_health` |
| `measuredAt` | **Get Start Date** dari sample → **Format Date** (ISO 8601, Include Time) |

`measuredAt` harus memuat jam dan zona waktu (`2026-10-26T18:19:00+07:00` atau `…Z`). Tanggal dihitung dari zona waktu Profil. Tanpa jam atau zona waktu, permintaan ditolak dengan `request_invalid`.

### Body fat (belum diuji di perangkat)

Salin blok Find → Count → If → Get Value → Get Contents of URL, ganti Type menjadi **Body Fat Percentage** dan field menjadi `bodyFatPercent`. Letakkan sebagai request terpisah setelah request berat:

- Server menolak **seluruh** body bila satu field di luar rentang (body fat 1–75). Nilai `0.25` bukan `25`; bila Get Value menampilkan pecahan, tambahkan **Calculate × 100**. Memisahkan request menjaga berat tetap tersimpan.
- Izin baca Body Fat diminta di run manual pertama. Bila ditolak, iOS menghentikan Shortcut di action itu, jadi berat harus sudah terkirim sebelumnya.

### Otomatis saat AFit ditutup (belum diuji di perangkat)

Shortcuts → **Automation** → **+** → **App** → AFit → **Is Closed** → Run Shortcut "Slothly Berat" → **Run Immediately**. Tutup AFit setelah hasil timbang tampil, supaya AFit sudah menulis ke Health.

## 3. Shortcut data Apple Watch (belum diuji di perangkat)

Nama: "Slothly Watch". Satu blok Find → Count → If → Get Value → Get Contents of URL per data, masing-masing request sendiri.

| Data | Type di Find | Rentang | Limit | Field | Rentang valid |
|---|---|---|---|---|---|
| Detak istirahat | Resting Heart Rate | in the last 2 days | 1, Latest First | `restingHeartRate` | 30–140 |
| VO₂ max | Cardio Fitness | in the last 30 days | 1, Latest First | `vo2Max` | 10–90 |
| Kalori aktif | Active Energy | is Today | tanpa limit | `calories` | 0–20000 |

- Tambahkan `provider` = `apple_health` dan `measuredAt` seperti di atas. Dengan `provider`, `vo2Max` dan `restingHeartRate` tersimpan sebagai data Apple Health lengkap dengan tanggal aslinya, dan masuk ke riwayat harian yang dipakai untuk tren. Tanpa `provider`, keduanya hanya mengisi nilai Profil dan tidak punya riwayat.
- Kalori: Active Energy punya banyak sample sehari. Ambil Value semuanya, jumlahkan dengan **Calculate Statistics → Sum**, kirim satu angka. App menimpa satu catatan per hari, jadi aman dijalankan berulang.
- Nama tipe di picker (**Cardio Fitness**, **Resting Heart Rate**) dikutip dari dokumentasi Shortcut sebelumnya dan belum dicek di iOS-mu.
- Pemicu: **Time of Day** sekitar 21:30 dengan Run Immediately. Belum diketahui apakah Health bisa dibaca saat iPhone terkunci. Uji dengan mengunci iPhone sebelum waktunya; bila gagal, pindahkan blok ini ke "Slothly Berat".

## Format permintaan

```http
POST /api/health-sync
Authorization: Bearer <token>
Content-Type: application/json

{ "provider": "apple_health", "measuredAt": "2026-10-26T18:19:00+07:00",
  "weightKg": 93.4, "bodyFatPercent": 28.1 }
```

| Bentuk | Perilaku |
|---|---|
| `provider: "apple_health"` + field datar | Diperlakukan seperti sample Apple Health. `measuredAt` opsional (default waktu kirim). Field `date` ditolak; tanggal dihitung dari `measuredAt`. |
| `provider: "apple_health"` + `samples: [...]` | Bentuk Shortcut v5 (lihat [health-shortcut.md](health-shortcut.md)). |
| field datar tanpa `provider` | Bentuk lama. `measuredAt` ditolak bila tanpa `provider`, supaya Shortcut yang lupa mengirim `provider` ketahuan. `weightKg`, `bodyFatPercent`, dan `calories` masuk catatan hari itu; `vo2Max`, `restingHeartRate`, `cardioMinutesWeekly` hanya menimpa nilai Profil, tanpa riwayat. `date` opsional. |

Semua field data opsional, tetapi minimal satu harus ada. Rentang: `weightKg` 1–400, `bodyFatPercent` 1–75, `vo2Max` 10–90, `restingHeartRate` 30–140, `calories` 0–20000. Satu nilai tidak valid menolak seluruh permintaan sebelum ada yang ditulis. Angka boleh dikirim sebagai teks numerik (`"93.4"`).

Satu pembacaan per data per tanggal: sample yang lebih baru menggantikan yang lebih lama pada tanggal itu, dan sample lebih lama tidak menimpa yang lebih baru (`received: 0`, `ignored ≥ 1`, bukan error).

## Pemecahan masalah

| Gejala | Penyebab dan perbaikan |
|---|---|
| `connection_invalid` | Token tidak terbaca atau tidak cocok. Periksa header (`Authorization`, `Bearer` + spasi + token, tanpa `=` atau kurung). Bila format sudah benar, tekan **Sambungkan ulang** dan salin token baru. |
| `request_invalid` | Angka terkirim sebagai teks dengan satuan (`93.4 kg`), angka `0` bawaan di depan variabel, nilai di luar rentang, `measuredAt` tanpa jam atau zona waktu, atau field `date` bersama `provider`. |
| "The network connection was lost" | Koneksi putus sebelum ada jawaban; bukan penolakan token. Periksa header yang rusak, lalu coba lewat Wi-Fi. |
| "This shortcut can't access …" | Izin domain Shortcut. Pilih Allow pada popup, atau ubah di pengaturan Shortcut (ikon ⓘ). |
| Count 0 / tidak ada data | AFit atau Watch belum menulis ke Health, atau filter tanggal terlalu sempit. Cek Health → tipe datanya → Data Sources. |
| `received: 0`, `ignored ≥ 1` | Nilai itu sudah ada atau lebih lama dari yang tersimpan. Bukan error. |

## Cara app memakai data ini

- **Berat dan body fat** → Progress → Tubuh dan Fitness. Komposisi (massa lemak dan massa bebas lemak) hanya dihitung dari hari yang punya keduanya; lihat [kebijakan](body-response-data-policy.md#komposisi-tubuh-dan-tren-fitness).
- **VO₂ max dan detak istirahat** → Fitness, dengan rata-rata terbaru dibanding baseline bila riwayatnya cukup. Riwayat hanya terbentuk dari permintaan yang memakai `provider: "apple_health"`.
- **Ringkasan AI** menerima pengamatan yang sama (`signals`) yang tampil di layar. Model tidak menghitung ulang; tanpa kunci AI, ringkasan memakai template deterministik.
