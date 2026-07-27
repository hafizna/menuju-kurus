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
