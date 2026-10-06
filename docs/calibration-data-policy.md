# Kalibrasi target & coach — Sprint 14

Implementasi lokal: Progress → Ringkasan → Evaluasi target & estimasi TDEE; API `/api/calibration`. Personal Adaptive Coach di Home menerima Body Response 28 hari dan tetap memilih maksimal tiga prioritas.

## Periode dan kecukupan

Kalibrasi memakai **28 hari kalender yang sudah selesai sampai kemarin**, menurut timezone pengguna. Hari ini dikeluarkan karena catatan/snapshotnya masih dapat bertambah. Pilihan grafik 14/28/56 hari tidak mengubah periode evaluasi target.

Semua syarat berikut wajib:

- Minimal 26/28 hari asupan lengkap dan valid; minimal 6 pada tiap pekan 7 hari. Catatan parsial/kosong tidak dianggap nol.
- Minimal 12 ukuran berat; minimal 3 pada masing-masing 7 hari awal dan akhir, dan 3 pada 14 hari tengah.
- Jarak ukuran pertama–terakhir minimal 21 hari; ukuran terakhir maksimal 3 hari dari akhir periode.
- Profil dewasa lengkap dan program telah diterapkan; BMI profil dan BMI menurut rata-rata berat akhir tidak di bawah 20.
- Aturan asupan/berat Body Response terpenuhi, tanpa flag pemeriksaan terkait; target aktif dan rata-rata asupan tidak di bawah batas awal program 1.500/1.200 kcal menurut profil.
- Simpangan baku ukuran berat di masing-masing jendela awal/akhir ≤1 kg; selisih laju awal→tengah dan tengah→akhir ≤0,5 kg/minggu; laju absolut ≤1% berat awal/minggu.

Syarat ini adalah heuristik produk, bukan standar klinis atau bukti akurasi catatan. Kondisi kesehatan, perubahan cairan, aktivitas besar, atau metode ukur dapat mengganggu estimasi meski jumlah data cukup. Pengguna meninjau konteks sebelum menerapkan; bila konteks berubah, pilih mempertahankan target.

## Perhitungan dan rentang

Berat awal/akhir memakai rata-rata ukuran di masing-masing jendela 7 hari. Laju dihitung menggunakan **selisih rata-rata tanggal sampel**, bukan jumlah hari akun atau selisih tanggal ukuran saja:

`laju kg/hari = (rata-rata berat akhir − rata-rata berat awal) / (rata-rata tanggal akhir − rata-rata tanggal awal)`

`estimasi maintenance = rata-rata asupan lengkap − laju × 7.700`

Pendekatan 7.700 kcal/kg hanya sinyal estimasi; tidak memisahkan cairan, lemak, atau otot. Angka aktivitas manual/Apple Health **tidak masuk rumus** karena perubahan berat dan asupan sudah menangkap respons periode tersebut.

Rentang sensitivitas = estimasi ± `max(200 kcal, 10% rata-rata asupan + 35% besar koreksi energi dari laju berat)`, dibulatkan keluar ke 50 kcal. Titik tengah dibulatkan ke 50 kcal. Rentang ini **bukan interval kepercayaan statistik** atau pengukuran metabolisme.

Estimasi <90% BMR profil, >4.500 kcal/hari, atau rentang bawah ≤0 menunda usulan. Batas ini hanya rentang penggunaan engine, bukan batas fisiologis.

## Usulan dan keputusan

Goal memakai penyesuaian program yang sudah ada: weight loss −18%, very lean −12%, athletic 0%, muscle gain +8%, beserta guard program. Jika target aktif masih berada dalam rentang sensitivitas setelah penyesuaian goal, pertahankan target dahulu.

Perubahan dibatasi `min(100 kcal, 5% target aktif)`, dibulatkan turun ke langkah 50 kcal. Batas awal program 1.500/1.200 kcal menurut profil tetap berlaku sebagai batas engine, bukan jaminan kecukupan personal. Jika batas tersebut tidak dapat dicapai secara bertahap dari target aktif, peninjauan manual diperlukan. Protein tidak diubah oleh kalibrasi.

- GET hanya memberi usulan; tidak menyimpan perubahan.
- **Terapkan** memerlukan konfirmasi peninjauan catatan/konteks, lalu server menghitung ulang dari data pengguna terautentikasi.
- **Tetap pakai target** menyimpan keputusan tanpa mengubah kalori/protein.
- Kedua keputusan menyimpan waktu, periode, target sebelum/sesudah, estimasi/rentang, serta evaluasi berikutnya 28 hari kemudian.
- Fingerprint terkait pengguna, tanggal, profil, asupan/berat, dan hasil perhitungan menolak usulan yang sudah berubah atau diputar ulang. Nilai target dari client tidak dipercaya.
- Compare-and-set atomik Redis pada settings memastikan dua keputusan kalibrasi yang bersamaan tidak sama-sama tersimpan. Ini tidak mengunci seluruh riwayat makanan/ukuran: koreksi yang terjadi setelah snapshot pembacaan tetap perlu diperiksa pada evaluasi berikutnya.
- Riwayat keputusan terbaru dipertahankan saat profil disimpan; riwayat yang dikirim client diabaikan. Bukan log audit seluruh keputusan, dan perubahan profil/manual tetap dapat dilakukan pengguna.

## Coach

Coach memakai kesiapan berat/asupan sebelum menilai respons tubuh. Bila konteks Body Response tersedia, tren lama yang tidak punya pemeriksaan kesiapan tidak dipakai untuk rekomendasi tren.

- Penurunan >max(0,7 kg, 1% berat baseline) per minggu: prioritas tinggi untuk meninjau kecukupan makan, tanpa menambah defisit.
- Selisih rata-rata berat ≤0,3 kg secara absolut dengan pinggang turun ≥0,5 cm dan kedua metrik siap: pertahankan pola dahulu; tidak menyimpulkan komposisi tubuh.
- Data belum siap: ajak melengkapi catatan/ukuran, tanpa memperketat target.
- Protein dari hari lengkap yang siap tetapi rata-rata <80% target: ajak membangun konsistensi sumber protein, tanpa klaim massa otot.

Confidence untuk konteks tubuh maksimal medium karena kecukupan data tidak membuktikan akurasi atau kausalitas. AI tetap penjelasan opsional; engine deterministik mengatur prioritas dan usulan. Tidak ada panggilan Gemini yang menentukan target.

## Validasi dan batas layanan

Regression tests mencakup rumus/rentang/batas perubahan, kecukupan, outlier, laju, cooldown, isolasi pengguna, pilihan tetap/terapkan, usulan stale, replay, dan keputusan bersamaan. Browser smoke memeriksa checkbox konteks, kedua keputusan, koreksi data sebelum apply, retry, target Home terbaru, dan mobile 320 px.

Adapter Redis sintetis memeriksa protokol dan perilaku compare-and-set; integrasi Redis Lua/Upstash nyata dan Gemini belum diuji tanpa konfigurasi layanan. Sebelum rilis, verifikasi fungsi EVAL pada database tujuan dan lakukan pengujian memakai data nyata yang disetujui pengguna.
