# Slothly Berat dan Slothly Watch

Halaman **Profil → Data kesehatan → Hubungkan Apple Health** menyediakan dua
templat bertanda tangan, berdasarkan aksi pembacaan Health dari Shortcut native
yang dikirim pengguna. Ekspor pribadi tidak dipublikasikan: semua kunci akun
dihapus sebelum fixture dan paket generik disimpan.

## Pasang di iPhone

1. Pilih **Siapkan koneksi**, lalu **Salin konfigurasi** di Slothly.
2. Pilih **Pasang Slothly Berat** atau **Pasang Slothly Watch**. Buka unduhan di
   iPhone, pilih **Set Up Shortcut / Atur Pintasan**, dan tempel seluruh JSON
   konfigurasi pada pertanyaan pemasangan. Gunakan konfigurasi yang sama untuk
   keduanya jika memasang dua Shortcut.
3. Jalankan masing-masing sekali di Shortcuts. Izinkan akses membaca jenis Health
   yang diminta dan koneksi ke alamat Slothly. Kembali ke app dan pilih
   **Periksa status**. Bandingkan hasilnya dengan Apple Health di Perjalanan.
4. Jika nama instalasi berbeda, isi **Nama Shortcut di iPhone berbeda?** sesuai
   nama yang terlihat di Shortcuts. Nama ini juga dipakai dalam panduan automasi.

File publik bernama **Slothly Berat.shortcut** dan **Slothly Watch.shortcut**.
Nama berkas dan header unduhannya sengaja sama dengan nama Shortcut agar iPhone
tidak memasang nama lowercase yang berbeda dari tombol Buka.

Konfigurasi disimpan sebagai aksi Text pada setiap Shortcut, tanpa dialog
pilihan metrik setiap kali berjalan. Setelah diisi, Shortcut menjadi pribadi;
jangan bagikan ulang. Konfigurasi tidak dimasukkan ke URL Buka, localStorage,
sessionStorage, atau database dalam bentuk token mentah. Browser menyimpan
pilihan nama Shortcut saja. Jika Clipboard API gagal, gunakan **Salin manual**.
Konfigurasi yang hilang dapat dibuat ulang melalui **Sambungkan ulang**, yang
menonaktifkan kunci lama: kedua Shortcut yang dipakai perlu dipasang ulang
dengan konfigurasi baru. Shortcut yang sudah bekerja tidak perlu dihubungkan ulang.

## Automasi Watch: harian 21.30

1. Shortcuts → **Automation → + → Time of Day**.
2. Isi **21:30**, pilih **Daily**, lalu **Next**.
3. **Run Shortcut → Slothly Watch → Run Immediately → Done**.

Pastikan data dari Apple Watch atau sumber lain sudah tersedia di Apple Health.
Unduhan ini tidak membuat personal automation; pengguna membuatnya di iPhone.

## Automasi Berat: setelah aplikasi timbangan ditutup

Syaratnya adalah **timbangan digital dengan aplikasi pendamping yang menulis
hasil ke Apple Health**. Gunakan aplikasi timbangan milik pengguna; AFit adalah
contoh, bukan satu-satunya aplikasi yang didukung. Slothly tidak menyambung
Bluetooth ke timbangan langsung.

1. Shortcuts → **Automation → + → App**.
2. Pilih aplikasi timbangan sendiri, centang **Is Closed**, hilangkan
   **Is Opened**, lalu **Next**.
3. **Run Shortcut → Slothly Berat → Run Immediately**. Matikan
   **Notify When Run** jika tersedia, lalu **Done**.
4. Uji sungguhan: timbang, tunggu hasil tampil di aplikasi timbangan dan Apple
   Health, lalu tutup aplikasi timbangan. Di Slothly, pilih **Periksa status**.

Jika aplikasi ditutup sebelum hasil masuk ke Health, jalankan Slothly Berat
lagi setelah data tersedia. Tidak ada jaminan data tiba dalam satu menit;
alurnya tergantung penulisan aplikasi timbangan, izin iOS, dan koneksi internet.
Panduan Apple: [membuat personal automation](https://support.apple.com/guide/shortcuts/apdfbdbd7123/ios).

## Data dan batas pembacaan

- Berat: Weight dan Body Fat Percentage hari ini, masing-masing satu sampel
  terbaru. Tidak adanya data dilewati; error izin native iOS dapat menghentikan
  proses. Pilih kg untuk berat badan di Health.
- Watch: Resting Heart Rate dari jendela dua hari, VO2 Max dari jendela 30 hari,
  serta jumlah Active Calories hari ini. Operator native tanggal `1002` berarti
  **Today**; angka lama pada field Number/Unit tidak mengubahnya menjadi tujuh hari.
- Query, Count, Get Value, kondisi cabang, dan Sum dipertahankan dari ekspor
  native. Nothing ditambahkan sebelum query agar keluaran konfigurasi/API
  tidak menjadi lingkup pencarian implisit.
- Unit dibaca sebelum pengiriman. Weight harus kg, body fat %, denyut istirahat
  BPM, VO2 mL/kg/min, dan energi aktif kcal. Unit yang tidak dikenali, termasuk
  lb dan kJ, menghentikan proses sebelum nilai tersebut dikirim. Tidak ada
  pelabelan ulang angka atau konversi yang ditebak. Untuk query energi dengan
  banyak sampel, semua unit harus sesuai sebelum jumlahnya dikirim.
- Berat, body fat, VO2, dan denyut istirahat dikirim dalam kontrak
  `{provider:"apple_health",samples:[{metric,value,measuredAt}]}`, dengan angka
  dan timestamp pengukuran asli. Kalori aktif harian memakai kontrak
  `{provider:"apple_health",calories:<sum>}` yang sudah didukung API.
- Watch memperbaiki `vo2max` menjadi `vo2Max` dan header `Authorisation`
  menjadi `Authorization`. Setiap metrik dikirim terpisah; status Health
  menampilkan pengiriman terakhir, bukan daftar gabungan seluruh permintaan.
- Tidak menulis ke Apple Health, tidak membaca clipboard saat sinkronisasi,
  dan tidak meminta langkah atau tidur. Shortcut gabungan v5 masih tersedia
  sebagai pilihan lama, dengan [dokumentasi terpisah](health-shortcut.md).

## Build dan verifikasi

```sh
python scripts/native-health-shortcuts.py
python scripts/native-health-shortcuts-test.py
python scripts/native-health-shortcuts.py --sign
python scripts/native-health-shortcuts.py --check
npm test
```

Generator mengambil fixture yang sudah dibersihkan di
`scripts/shortcut-templates/`. `--sign` mengirim templat generik ke layanan
penandatanganan; token pribadi maupun hasil pengukuran tidak ikut dikirim.
Manifest mencatat hash fixture, generator, unsigned, dan signed AEA1.

Tes lokal memeriksa format, alur, payload numerik/tanggal, kredensial, dan
unduhan publik. Pembacaan asli sudah dicoba pengguna, tetapi **pemasangan
templat generik baru beserta automasinya belum diverifikasi di iPhone fisik**.
Verifikasi perangkat harus meliputi pertanyaan impor, nama terpasang, izin,
satuan, tanggal, penerimaan server, dan pemicu automasi.
