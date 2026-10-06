# Menuju Kurus — Product Roadmap

Menuju Kurus diposisikan sebagai **personal nutrition decision assistant**, bukan sekadar aplikasi penghitung kalori.

Logika utama tetap deterministic dan dapat diuji. AI hanya menjelaskan keputusan yang sudah dihitung oleh engine lokal; AI tidak menentukan target, ranking, atau aturan keselamatan.

## Fondasi produk

Sprint awal membangun calorie tracking, weight intelligence, health score, weekly review, decision coach, fitness goal profile, dan satiety intelligence.

## Fase integrasi

### Sprint 7 — Apple Health Sync V2 ✅

- Sinkronisasi berat dan body fat lewat `/api/health-sync` (satu entry per hari, menimpa bukan menumpuk).
- Sinkronisasi VO₂ max dan resting heart rate ke Settings sebagai nilai terbaru.
- Sinkronisasi workout duration (`cardioMinutesWeekly`) dan active energy.
- Setiap field independen dan opsional — field yang tidak dikirim di satu sync tidak menghapus nilai dari sync sebelumnya. Konflik diselesaikan secara eksplisit (overwrite per field), bukan menumpuk nilai setiap sync.
- Tidak mencakup "strength days" otomatis — Shortcuts tidak punya cara reliable menghitung hari latihan beban dari HealthKit, jadi field itu tetap manual di Settings.

### Sprint 8 — Restaurant Intelligence ✅

- Pencarian menu restoran Indonesia tanpa foto.
- Library lokal untuk warteg, rumah makan Padang, ayam, bakso/mi, soto, fast food, dan kafe.
- Ranking berdasarkan sisa kalori, sisa protein, rasa kenyang, goal aktif, dan kecocokan pencarian.
- Koreksi porsi sebelum disimpan.
- Pencatatan sebagai estimasi manual dengan catatan asumsi yang transparan.

### Sprint 9 — Habit Intelligence ✅

- Analisis rolling 28 hari atas menu dan waktu makan yang paling sering berulang.
- Quick add memakai rata-rata kalori, makro, dan asumsi porsi dari catatan pengguna sendiri.
- Tahap kesiapan data: insufficient, learning, dan ready.
- Insight baru aktif setelah minimal 10 hari tercatat dan 20 makanan, sehingga aplikasi tidak menyimpulkan kebiasaan terlalu dini.
- Pola yang membantu atau perlu diperhatikan ditampilkan sebagai sinyal, bukan klaim sebab-akibat.

### Sprint 10 — Personal Adaptive Coach ✅

- Menggabungkan status kalori/protein hari ini, budget mingguan, tren berat, goal, dan Habit Intelligence.
- Menerima konteks langsung dari pengguna: lapar, sangat lapar, craving, atau makan di luar.
- Memberikan maksimal tiga prioritas yang diranking secara deterministic, disertai bukti data dan tindakan berikutnya.
- Menggunakan menu berulang pengguna sebagai saran hanya setelah data kebiasaan siap.
- Menjelaskan trade-off porsi ketika menu biasa lebih besar daripada budget yang tersisa, tanpa melarang makanan.
- Mendeteksi tren penurunan berat yang terlalu cepat agar aplikasi tidak menambah defisit secara agresif.
- Recovery tetap tidak menggunakan puasa kompensasi, muntah, atau olahraga sebagai hukuman.
- AI tetap menjadi explanation layer opsional; AI tidak menentukan prioritas coach.

## Fase berikutnya — keputusan nutrisi dengan umpan balik tubuh

Status: Sprint 11–14 diimplementasikan dengan regression tests lokal; integrasi Upstash/Gemini nyata masih memerlukan konfigurasi. Sprint 7–10 di atas mempertahankan status dokumentasi sebelumnya.

Positioning tetap personal nutrition decision assistant. Pengukuran tubuh memperkaya evaluasi dan keputusan yang sudah ada; bukan diagnosis atau pengganti penilaian klinis. Navigasi utama tetap Home, Makan, Progress, Profil. Restaurant, Habit, Fitness, dan Apple Health Sync tetap dipertahankan.

### Sprint 11 — Fondasi energi & dukungan tiga pengguna (implementasi lokal)

- Target harian menjadi target asupan; aktivitas rutin sudah tercakup dalam estimasi maintenance. Active Energy ditampilkan terpisah dan tidak otomatis menambah budget makan.
- Audit seluruh pemakai net/remaining: Home, budget mingguan, restaurant/satiety ranking, coach, health score, streak, weekly review, dan exercise credit. Jangan mengganti satu rumus sambil membiarkan interpretasi lain memakai model lama.
- Bedakan hari belum dicatat dari hari dengan asupan nol; tambah mekanisme konfirmasi kelengkapan catatan untuk analisis berikutnya.
- Tinjau feedback sukses agar asupan terlalu rendah tidak otomatis diberi penghargaan. Kriteria kecukupan dan batasannya harus eksplisit sebelum implementasi.
- Perluas konfigurasi pengguna menjadi tiga slot, dengan isolasi Redis, session, dan Health Sync; pertahankan identitas u1/u2 dan data lama.
- Pertahankan catatan historis mentah; jelaskan perubahan interpretasi budget dan jangan menerapkan rekomendasi target baru tanpa persetujuan pengguna.
- Implementasi: status catatan melalui `PATCH /api/log` dan kontrol Home/Mingguan; streak menjadi konsistensi pencatatan lengkap; rentang feedback target 80–100% adalah heuristik, bukan minimum klinis.
- Acceptance: aktivitas tidak menghitung budget dua kali; hari kosong tidak dianggap defisit; pengguna ketiga dapat login dan tidak membaca/mengubah data pengguna lain; regression checks mencakup seluruh konsumen budget.

### Sprint 12 — Body Metrics & redesign Progress (implementasi lokal)

- Progress: Ringkasan, Tubuh, Fitness, Mingguan. Tautan lama tab=weight tetap diarahkan ke Tubuh.
- Prioritas: berat dan lingkar pinggang. Pinggul, paha, dan body fat opsional. BMI dan waist-to-height ratio menjadi detail kontekstual; WHR/WTR bukan fokus utama.
- Riwayat pengukuran bertanggal, source per field, timestamp, satuan, serta edit/koreksi. Nilai parsial tidak menghapus field lain. Integrasikan riwayat berat dan Health Sync yang ada tanpa menggandakan catatan.
- Rasio dihitung dari pengukuran yang sesuai waktu dan tinggi referensinya; jangan diam-diam memasangkan pinggang baru dengan pinggul lama. Simpan konteks tinggi yang diperlukan agar riwayat tidak berubah tanpa penjelasan.
- Check-in pinggang mingguan; pinggul/paha dua mingguan opsional, dengan panduan posisi ukur konsisten. Pengingat dapat diabaikan.
- Avatar skematis opsional berdasarkan ukuran yang tersedia, dengan perbandingan dua tanggal dan label angka. BMI tidak mengubah bentuk avatar. Spesifikasi di [Progress visualizations](docs/progress-visualizations.md).
- Implementasi: `/api/body` menyatukan riwayat berat lama dan check-in tambahan; tinggi/sumber/waktu per field; Progress empat tab, grafik kalender, koreksi/hapus per ukuran, avatar opsional, dan sinkronisasi body fat mandiri.
- Acceptance: nilai hilang tidak direka; ukuran dan tanggal sumber terlihat; avatar tidak mengklaim bentuk anatomis, massa otot, atau lemak visceral; alur mobile dan tabel alternatif dapat digunakan tanpa visual.

### Sprint 13 — Body Response Intelligence (implementasi lokal)

- Tren 14/28/56 hari: asupan, aktivitas, berat, pinggang, dan protein, dengan cakupan data masing-masing.
- Rata-rata asupan hanya dari hari yang dikonfirmasi lengkap; tampilkan jumlah hari dan jangan mengisi hari kosong dengan nol.
- Gunakan panel grafik terpisah dengan sumbu waktu selaras; tidak memakai dual-axis yang memberi kesan hubungan kuat.
- Tetapkan dan uji aturan kecukupan data per insight sebelum mengaktifkannya. Umur akun 28 hari saja bukan syarat cukup.
- Tampilkan perubahan bersama secara deskriptif, tanpa klaim sebab-akibat atau estimasi kehilangan otot/lemak visceral.
- Implementasi: Ringkasan Progress memakai `/api/body-response`, lima panel bertanggal selaras, tabel parsial, coverage/kesiapan per metrik, dan perbandingan periode sebelumnya. Syarat asupan 75% + sebaran tiap paruh 60%; berat minimal 4/8/16 sampel dengan dua sampel per jendela 7 hari awal/akhir. [Kebijakan lengkap](docs/body-response-data-policy.md).
- Acceptance: tanggal tidak selaras, data jarang, outlier, dan periode kosong menghasilkan status data yang jujur; semua insight punya angka sumber dan periode.

### Sprint 14 — Adaptive Coach & kalibrasi TDEE (implementasi lokal)

- Perluas engine Sprint 10 dengan tren tubuh yang cukup konsisten; maksimal tiga prioritas tetap berlaku.
- Bedakan berat stabil dengan pinggang berubah, laju berat terlalu cepat, dan data yang belum cukup, tanpa diagnosis.
- Kalibrasi TDEE memakai asupan lengkap dan tren berat tersmoothing. Pendekatan 7.700 kcal/kg hanya sinyal estimasi, bukan konstanta fisiologis presisi.
- Tetapkan minimum coverage, rentang estimasi, batas perubahan, kondisi penundaan, dan evaluasi ulang sebelum fitur diaktifkan.
- Tampilkan target lama/usulan/alasan; pengguna menyetujui perubahan. AI tetap explanation layer opsional.
- Implementasi: Home memakai kesiapan Body Response; `/api/calibration` memakai 28 hari tertutup, 26 hari asupan lengkap, 12 ukuran berat dan guard variasi/laju. Progress menampilkan maintenance profil, estimasi/rentang, target lama/usulan, pilihan terapkan/tetap, validasi ulang server, dan jeda 28 hari. [Kebijakan lengkap](docs/calibration-data-policy.md).
- Acceptance: input tidak lengkap tidak mengubah target; aktivitas tidak dihitung lagi dalam estimasi terkalibrasi; penolakan usulan mempertahankan target pengguna.

### Batas scope dan urutan validasi

- Implementasikan dan validasi Sprint 11 sebelum insight budget baru; Sprint 12 dapat dirancang visualnya lebih awal dengan data demo berlabel.
- Untuk tiga pengguna awal, prioritaskan pencatatan mudah, model energi konsisten, berat/pinggang, dan ringkasan yang bisa ditindaklanjuti.
- Tunda avatar 3D/fotorealistik, prediksi bentuk tubuh target, skor metabolik gabungan, diagnosis dari rasio, dan analisis korelasi otomatis.
- Prototipe tidak membuktikan fitur berfungsi. Database, autentikasi, build, dan functional checks tetap perlu disiapkan sebelum rilis.

## Positioning

Produk pembanding umumnya unggul pada satu domain: logging, detail nutrisi, adaptive calorie target, atau behavioral coaching. Menuju Kurus menggabungkan:

- decision engine,
- satiety intelligence,
- goal-aware coaching,
- context-aware meal suggestions,
- habit intelligence dari data pengguna sendiri,
- personal adaptive coaching,
- AI explanation tanpa menyerahkan logika keputusan kepada chatbot.

Kombinasi ini membuat produk lebih dekat ke personal nutrition decision assistant daripada aplikasi diet konvensional.
