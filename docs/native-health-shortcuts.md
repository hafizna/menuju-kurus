# Slothly Berat dan Slothly Watch

Halaman **Profil → Data kesehatan → Hubungkan Apple Health** menyediakan dua
templat v2 bertanda tangan, berdasarkan aksi pembacaan Health dari Shortcut
native yang dikirim pengguna. Pasang templat generik, lalu hubungkan akun lewat
tombol di app. Browser tidak menerima token akses Health.

## Pasang di iPhone

1. Buka **Profil → Data kesehatan → Hubungkan Apple Health** di Slothly.
2. Pilih **Pasang Slothly Berat** atau **Pasang Slothly Watch**, buka unduhan di
   iPhone, lalu pilih **Tambah Shortcut**. Pasang keduanya jika memakai kedua
   jenis sinkronisasi. Tidak ada pertanyaan impor atau isian konfigurasi.
3. Kembali ke Slothly dan pilih **Hubungkan lewat Slothly Berat** atau
   **Hubungkan lewat Slothly Watch**, sesuai Shortcut yang sudah dipasang.
   Cukup pilih salah satunya sekali pada iPhone ini; keduanya memakai koneksi
   bersama.
4. Di Shortcuts, periksa nama akun pada dialog **Hubungkan Slothly**. Nama ini
   berasal dari server Slothly. Lanjutkan hanya jika itu akunmu. Setelah
   persetujuan, Shortcut menguji koneksi, menyimpan koneksi pribadi, lalu
   membaca metrik Health miliknya. Izinkan koneksi ke Slothly, akses berkas, dan
   pembacaan Health saat iPhone meminta.
5. Kembali ke app dan pilih **Periksa status**. Bandingkan tanggal dan hasil
   pengukuran dengan Apple Health di Progress. Status uji koneksi bukan bukti
   bahwa pengukuran sudah diterima.
6. Jika nama instalasi berbeda, isi **Nama Shortcut di iPhone berbeda?** sesuai
   nama yang terlihat di Shortcuts. Nama ini juga dipakai dalam panduan automasi.

File publik bernama **Slothly Berat.shortcut** dan **Slothly Watch.shortcut**.
Nama berkas dan header unduhannya sengaja sama dengan nama Shortcut agar iPhone
tidak memasang nama lowercase yang berbeda dari tombol Buka.

Setelah tersambung, gunakan **Buka Slothly Berat** atau **Buka Slothly Watch**
untuk menjalankan sinkronisasi berikutnya. Keduanya membaca koneksi dari
`Shortcuts/Slothly/connection.json`; tidak perlu menghubungkan ulang untuk
menjalankan Shortcut yang satunya. Jalankan masing-masing sekali untuk
memberikan izin Health yang dibutuhkan sebelum membuat automasi.

Jika nama akun salah atau pengujian koneksi gagal, berkas koneksi sebelumnya
tidak diganti dan belum ada data Health yang dibaca. Kembali ke Slothly untuk
menghubungkan lagi. Jika berkas koneksi hilang atau mengganti iPhone, pilih
**Hubungkan lewat …** kembali. Shortcut yang sudah berfungsi tidak perlu
dihubungkan ulang.

## Koneksi akun dan privasi

App menyiapkan kode sekali pakai yang berlaku hingga lima menit setelah status akun
berhasil dimuat. Tombol **Hubungkan lewat …** adalah tautan
`shortcuts://run-shortcut` dengan input teks berisi kode sementara dan alamat
penukarannya. Kode diperbarui saat kembali ke app atau mendekati kedaluwarsa.
Menyiapkan kode tidak menerbitkan atau merotasi token akses yang sudah bekerja.

Shortcut menukar kode langsung ke server Slothly. Server mengembalikan token
akses dan nama akun; setelah konfirmasi akun dan pengujian berhasil, Shortcut
menyimpan hanya endpoint dan token dalam `Shortcuts/Slothly/connection.json`.
Server menyimpan hash token. Browser tidak menerima Bearer token dan tidak
menaruhnya di DOM, URL, clipboard, localStorage, atau sessionStorage. Kode
sementara hanya disimpan dalam state halaman dan tautan pembuka; pilihan nama
Shortcut boleh disimpan di localStorage.

Berkas koneksi bersifat pribadi dan dapat tersinkron melalui iCloud sesuai
pengaturan perangkat. Jangan bagikan berkas tersebut atau tautan penghubung.
Menghubungkan instalasi baru menambah akses tanpa merotasi akses instalasi lain.
**Putuskan koneksi** mencabut seluruh akses Shortcut dan membatalkan kode
penghubung sebelumnya; pengukuran yang sudah diterima tetap tersimpan.

Templat publik dikunci ke `https://menuju-kurus.vercel.app`, baik untuk penukaran
kode maupun endpoint Health. Alamat lain ditolak sebelum pembacaan Health.
Deployment lain atau preview memerlukan templat yang dibangun dan ditandatangani
untuk origin yang sesuai; mengganti domain web saja tidak mengubah file Shortcut.

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
  dan tidak meminta langkah atau tidur. Shortcut gabungan v5 yang sudah
  tersambung tetap dapat dipakai; [dokumentasi arsipnya](health-shortcut.md)
  menjelaskan alur sebelumnya, bukan pemasangan v2.

## Build dan verifikasi

```sh
python scripts/native-health-shortcuts.py
python scripts/native-health-shortcuts-test.py
python scripts/native-health-shortcuts.py --sign
python scripts/native-health-shortcuts.py --check
npm test
```

Generator mengambil fixture yang sudah dibersihkan di
`scripts/shortcut-templates/`. Ekspor pribadi asli tidak dipublikasikan.
`--sign` mengirim templat generik ke layanan penandatanganan; tidak ada token,
kode penghubung, nama akun pribadi, atau hasil pengukuran yang ikut dikirim.
Manifest mencatat hash fixture, generator, unsigned, dan signed AEA1. Berkas
publik tidak berisi konfigurasi akun dan tidak memakai pertanyaan impor.

Tes lokal memeriksa format, alur, payload numerik/tanggal, kredensial, dan
unduhan publik. Pembacaan asli sudah dicoba pengguna, tetapi **pemasangan
templat generik baru beserta automasinya belum diverifikasi di iPhone fisik**.
Verifikasi perangkat harus meliputi nama terpasang, pembukaan tautan dari Safari,
konfirmasi akun, pengujian koneksi, izin berkas/Health, penggunaan berkas bersama
oleh kedua Shortcut, satuan, tanggal, penerimaan server, dan pemicu automasi.
