# Rumah Kukang: tampilan dan alur harian

Slothly memakai identitas krem hangat, cokelat kopi, dan hijau daun. Ilustrasi kanopi/dahan serta rig SVG kukang dibuat untuk Slothly. Tidak memakai gambar, karakter, komposisi layar, atau aset dari aplikasi referensi.

## Alur utama

1. Home menampilkan sapaan sesuai zona waktu akun, asupan/protein tercatat, dan tombol Catat makan.
2. Catat menampilkan makanan terbaru/berulang, foto, dan isian manual. Pengguna meninjau porsi dan waktu sebelum menyimpan.
3. Hasil koreksi nasi, minyak/saus, dan bagian yang dimakan memperbarui rincian serta total bersama-sama. Override kcal diberi label bahwa makro tetap estimasi porsi, bukan dihitung ulang dari kcal.
4. Catatan terbaru tersedia di Home. Saat malam, penutupan hari dinaikkan posisinya; hari yang sudah lengkap bisa dibuka lagi.
5. Review 7 hari berakhir dengan satu fokus pilihan pengguna. Fokus, tanggal evaluasi, dan tanda tercapai tersimpan per akun dan muncul di Home.

## Draft dan kegagalan jaringan

- Draft teks, estimasi, dan koreksi tersimpan sementara di `sessionStorage`, dipisahkan berdasarkan akun dan tanggal. Foto asli/blob hanya berada dalam memori tab; tidak masuk penyimpanan browser atau database.
- Penggantian tanggal tidak boleh memindahkan makanan ke tanggal lain secara diam-diam. Draft lama memerlukan pilihan eksplisit dan tetap tunduk pada batas tanggal/waktu server.
- Isian tidak dibuang ketika penyimpanan gagal. Simpan, hapus, dan Batalkan memeriksa hasil HTTP; kegagalan memuat data ditampilkan bersama pilihan mencoba lagi.

## Feedback dan Progress

- Ekspresi maskot Home mengikuti kelengkapan catatan, bukan penilaian jumlah kalori. Ekspresi kenyang tidak dipicu otomatis oleh asupan melewati target.
- Skor Fitness belum ditampilkan sampai baseline yang diperlukan tersedia. Tidak ada data bukan berarti performa buruk.
- Ringkasan mingguan memakai rentang tanggal eksplisit dan sidik data. Koreksi catatan/target, perubahan berat, atau pergantian periode membuat narasi lama ditandai perlu diperbarui.
- Hari di bawah rentang, dalam rentang, di atas rentang, dan belum lengkap dihitung terpisah. Success rate tidak digunakan untuk menebak arah penyimpangan.
- Grafik dan evaluasi target merupakan detail yang dibuka pengguna; kesiapan data ditampilkan tanpa menghitung mundur hari yang belum pasti.

## Pengaturan

Nama saat onboarding opsional. Target berat ditanyakan untuk tujuan penurunan berat; tujuan performa/otot dapat mulai tanpa menetapkan target penurunan. Input yang belum valid memiliki pesan yang menjelaskan perbaikannya.

Melihat rekomendasi pada Profil menghitung preview lokal. Menyimpan program atau menerapkan rekomendasi tetap merupakan tindakan eksplisit. Validasi editor mencegah pengguna menerapkan nilai berbeda dari preview akibat normalisasi server.

Pengaturan Kurangi animasi memakai preferensi browser lokal; preferensi reduced motion perangkat tetap dihormati. Maskot juga berhenti bergerak di luar layar dan ketika tab tidak aktif. Mobile mempertahankan empat destinasi bawah, desktop memakai navigasi samping dan ruang konten lebih lebar.

## Validasi

`npm test`, `npm run typecheck`, dan `npm run build` memeriksa logika, kontrak tipe, dan build produksi. `npm run test:browser` menggunakan akun serta Redis REST sintetis; `PLAYWRIGHT_EXECUTABLE_PATH` dapat menunjuk Chromium lokal. Pemeriksaan ini tidak membuktikan konfigurasi layanan Upstash, Gemini, atau DeepSeek produksi.
