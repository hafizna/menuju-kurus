# Body Response — kebijakan data Sprint 13

Implementasi lokal tersedia pada Progress → Ringkasan dan `GET /api/body-response?days=14|28|56`. Periode berakhir pada tanggal hari ini menurut timezone pengguna. Periode pembanding tepat sepanjang periode yang dipilih, tanpa overlap. Kalender tidak mengisi tanggal kosong dengan observasi fiktif.

## Catatan dan sumber

- Asupan dan protein untuk rata-rata/grafik hanya berasal dari hari yang dikonfirmasi lengkap. Tabel tetap menampilkan catatan parsial. Catatan lengkap dengan angka nol tetap nol, tetapi asupan sangat rendah ditandai untuk ditinjau.
- Tidak ada catatan aktivitas berarti tidak diketahui; snapshot nol eksplisit tetap nol. Snapshot Apple Health terbaru pada tanggal itu diprioritaskan dibanding penjumlahan manual yang mungkin tumpang tindih. Angka ini bukan total pengeluaran energi/TDEE dan snapshot hari ini dapat bertambah.
- Rata-rata aktivitas hanya memakai tanggal dengan data. Sumber manual dan Apple Health yang bercampur menunda insight aktivitas. Perbandingan antarperiode juga mensyaratkan sumber yang sama.
- Berat dan pinggang memakai tanggal ukuran sebenarnya. Tinggi, BMI, body fat, dan bentuk avatar tidak dipakai untuk mengarang pengukuran atau mengestimasi massa otot/lemak visceral.

## Aturan kesiapan

Aturan berikut adalah heuristik kualitas data produk, bukan standar klinis atau bukti akurasi pencatatan.

| Metrik | Syarat insight |
|---|---|
| Asupan, protein, aktivitas | Minimal ceil(75% × hari periode) observasi valid; minimal ceil(60% × hari tiap paruh) di masing-masing paruh |
| Berat | Minimal 4/8/16 ukuran untuk 14/28/56 hari; minimal dua ukuran pada masing-masing 7 hari awal dan akhir; jarak ukuran pertama–terakhir minimal setengah periode |
| Pinggang | Minimal dua ukuran; ada pada 7 hari awal dan akhir; jarak pertama–terakhir minimal setengah periode |

Perubahan berat adalah selisih rata-rata ukuran pada jendela 7 hari akhir dan awal, dengan jumlah sampel ditampilkan. Perubahan pinggang adalah selisih ukuran pertama–terakhir dengan tanggal aktual. Angka selisih yang masih bisa dihitung tetap tersedia ketika insight belum siap, disertai status dan alasan penundaan.

Insight pasangan hanya aktif ketika kedua metrik siap pada periode yang sama. Selisih rata-rata antarperiode hanya aktif ketika kedua periode siap. Tidak ada korelasi statistik, klaim sebab-akibat, kalibrasi TDEE, atau perubahan target otomatis pada Sprint 13.

## Pemeriksaan nilai

Nilai numerik tidak finite atau negatif tidak dipakai; berat/pinggang nol juga tidak dipakai. Nilai ekstrem yang masih valid **tetap ditampilkan dan masuk rata-rata**, tetapi menunda insight metrik terkait sampai catatan ditinjau/dikoreksi pada alur pencatatan yang ada. Tidak ada penghapusan otomatis atau tombol mengabaikan flag.

Flag pemeriksaan:

- Asupan lengkap <300 atau >8.000 kcal/hari; protein >600 g/hari; aktivitas >5.000 kcal/hari.
- Berat <25 atau >350 kg; pinggang <30 atau >200 cm.
- Perubahan berat antarobservasi dalam ≤7 hari >max(3 kg, 5% berat sebelumnya).
- Perubahan pinggang antarobservasi dalam ≤14 hari >10 cm.

Pemeriksaan perubahan berlaku di dalam masing-masing periode, bukan deteksi medis atau pemeriksaan seluruh riwayat. Variasi cairan, metode ukur, kondisi perangkat, atau kesalahan pencatatan dapat memengaruhi angka. Threshold ini tidak boleh dianggap sebagai batas aman atau normal tubuh.

## Validasi

Unit/regression tests mencakup data kosong/parsial/nol, cakupan dan sebaran, sampel/jarak ukuran, outlier tanpa penghapusan, sumber aktivitas, kalender, serta API yang terisolasi per pengguna. Browser smoke memakai data sintetis untuk pergantian periode, retry, tabel mobile, dan regresi alur Tubuh/Fitness/Mingguan. Integrasi Upstash/Gemini nyata belum diuji tanpa konfigurasi layanan.

## Komposisi tubuh dan tren fitness

Implementasi di `lib/fitnessTrends.ts`, tampil di Progress → Fitness, dan masuk ke ringkasan AI sebagai `signals`. Ambang di bawah adalah heuristik kualitas data produk, bukan standar klinis, dan tidak mengubah skor Fitness: tren menjelaskan data, bukan menilai pengguna.

| Tren | Jendela | Syarat siap | Catatan |
|---|---|---|---|
| Komposisi (berat, body fat, massa lemak, massa bebas lemak) | 14 hari terakhir vs 14 hari sebelumnya, tanpa overlap | Minimal 3 tanggal berpasangan (berat **dan** body fat) di tiap jendela. Keyakinan "sedang" bila minimal 5 di keduanya, selain itu "rendah" | Tanggal yang hanya punya salah satu tidak dihitung |
| Detak istirahat | 7 hari terakhir vs 28 hari sebelumnya | Minimal 3 dan 7 pembacaan | Selisih ≥ +5 bpm disebut lebih tinggi, ≤ −3 bpm lebih rendah. Dianggap lama setelah 14 hari |
| VO₂ max | 30 hari terakhir vs 90 hari sebelumnya | Minimal 1 dan 1 pembacaan | Perubahan ≥ 2 disebut naik/turun. Dianggap lama setelah 60 hari |

Perhitungan komposisi: massa lemak = berat × body fat %, massa bebas lemak = berat − massa lemak, masing-masing dirata-ratakan per jendela dari tanggal berpasangan. **Massa bebas lemak bukan massa otot**: ia mencakup air, glikogen, organ, dan tulang. Aplikasi tidak menyebut kehilangan atau penambahan otot dan tidak memperkirakan lemak visceral; kebijakan di atas tentang body fat dan massa otot tetap berlaku.

Pola yang diberi nama (ambang perubahan berat 0,3 kg; bagian massa bebas lemak ≥ 50% dari perubahan berat dianggap "besar"):

| Pola | Syarat perubahan (terbaru − sebelumnya) |
|---|---|
| `fat_loss` | berat ≤ −0,3 kg dan massa bebas lemak ≥ −0,3 kg |
| `fat_free_loss_high` | berat ≤ −0,3 kg dan massa bebas lemak turun ≥ 50% dari penurunan berat |
| `mixed_loss` | berat ≤ −0,3 kg, massa bebas lemak turun lebih dari 0,3 kg tetapi < 50% dari penurunan berat |
| `gain_mostly_fat` / `gain_mostly_fat_free` | berat ≥ +0,3 kg; massa bebas lemak < atau ≥ 50% dari kenaikan berat |
| `recomposition_signal` | berat stabil, massa lemak ≤ −0,3 kg dan massa bebas lemak ≥ +0,3 kg |
| `stable` | selain di atas |

Kalimat hasilnya selalu menyebut bahwa angka berasal dari estimasi timbangan impedansi dan bahwa body fat bergeser karena cairan dan waktu timbang. Prioritas hanya muncul untuk `fat_free_loss_high` (semua goal), `gain_mostly_fat` (hanya `muscle_gain`), dan detak istirahat ≥ +5 bpm di atas baseline; yang terakhir selalu disertai bahwa penyebabnya bisa tidur, stres, kafein, latihan berat, atau kurang sehat, dan bukan diagnosis.

Riwayat harian VO₂ max dan detak istirahat disimpan di `fitnessHistory`: satu titik per metrik per tanggal (pembacaan terbaru menang), maksimal 180 titik. Hanya permintaan dengan `provider: "apple_health"` yang mengisinya; isian Profil dan permintaan bentuk lama tidak punya riwayat. Pembacaan lama ditampilkan dengan umurnya, bukan sebagai kondisi terkini.

Input AI: `signals`, `composition`, `restingHeartRateTrend`, dan `vo2MaxTrend` dihitung secara deterministik di server. Prompt menginstruksikan model memakai `signals` sebagai sumber penjelasan, tidak menghitung ulang, tidak menyebut otot, dan melewati data yang `ready: false`. Ringkasan mingguan menerima `signals` yang sama dan menandai ringkasan tersimpan sebagai usang bila `signals` berubah.
