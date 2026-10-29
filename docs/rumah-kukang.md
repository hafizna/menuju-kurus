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

Layar memuat data menampilkan kukang di tengah layar dengan kegiatan yang dipilih acak: memantulkan bola tenis di raket, menyundul bola sepak, atau berjalan membawa tas. Kegiatan berikutnya tidak sama dengan yang terakhir tampil. Halaman penuh (Hari ini, Progress, Profil, Rencana) memakai versi besar, tab di dalam Progress memakai versi kecil. Gambar hanya dekorasi, jadi pembaca layar hanya membaca teks "Memuat …". Dengan Kurangi animasi, kukang berhenti dalam pose diam dan teksnya tetap tampil. Lembar "Membaca makananmu" saat foto makanan dianalisis memakai kukang yang sama di sebelah kiri daftar langkahnya.

## Validasi

`npm test`, `npm run typecheck`, dan `npm run build` memeriksa logika, kontrak tipe, dan build produksi. `npm run test:browser` menggunakan akun serta Redis REST sintetis; `PLAYWRIGHT_EXECUTABLE_PATH` dapat menunjuk Chromium lokal. Pemeriksaan ini tidak membuktikan konfigurasi layanan Upstash, Gemini, atau DeepSeek produksi.

## Koreksi makanan yang sudah tersimpan

- Makanan dari foto menyimpan rinciannya: bahan beserta gram, kalori, dan makro, koreksi nasi, minyak/saus, dan porsi yang dimakan, jumlah tiap bahan lain (mis. telur 1 menjadi 3), kalori atau protein yang diketik sendiri, dan keterangan untuk AI. Foto tidak pernah disimpan. Makanan manual dan makanan yang disimpan sebelum fitur ini hanya punya angka total.
- Riwayat di halaman Makan bisa dibuka per hari untuk 7 hari terakhir (hari ini dan enam hari sebelumnya, sama dengan jendela review mingguan). Setiap hari dibuka sebagai **dua cincin**: kalori di luar, protein di dalam, dengan kata-kata di sampingnya. Kalori memakai pita yang sama dengan review mingguan (di bawah rentang di bawah 80% target, dalam rentang sampai 100%, di atas target setelah itu; kelebihannya digambar sebagai putaran kedua berwarna merah di atas cincin yang sudah penuh, jadi seberapa jauh di atas target terlihat dari panjang busurnya), protein dibandingkan dengan target proteinnya. Aktivitas ditampilkan tetapi tidak mengubah cincin makanan. Hari yang belum ditandai lengkap diberi catatan bahwa angkanya sementara, dengan tombol **Tandai lengkap** (sama dengan "Sudah semua, tutup hari" di Beranda). Makanan manual tanpa protein dihitung 0 g dan diberi catatan. Mengetuk kartu cincin membuka daftar makanan hari itu; mengetuk makanan menampilkan rincian bahan; **Koreksi** membuka peninjauan yang sama seperti setelah memotret. Berpindah hari menutup daftar lagi.
- Makanan dengan rincian dikoreksi lewat bahan: jumlah tiap bahan, nasi, minyak/saus, porsi yang dimakan, serta kalori dan protein yang bisa diketik. Mengubah salah satu jumlah mengembalikan angka ketikan ke estimasi. Makanan tanpa rincian dikoreksi lewat nama, jam, kalori, protein, karbo, lemak, dan gula tambahan.
- **Keterangan untuk AI** (mis. "telur 3 butir") bisa diisi sebelum foto dikirim, atau setelahnya dengan tombol **Hitung ulang**. Hitung ulang tidak memakai foto: AI menerima rincian bahan yang tersimpan dan keterangannya, lalu mengembalikan rincian baru. Keterangan dikirim ke Gemini sebagai teks dalam tanda kutip dan diperlakukan sebagai fakta tentang makanan itu, bukan perintah; panjangnya dibatasi 200 karakter. Pada batas gratis Google, teks ini dapat dipakai Google untuk meningkatkan produknya, jadi jangan menulis data pribadi.
- Koreksi mengubah angka dan jam di tanggal yang sama; tidak memindahkan makanan ke hari lain. Koreksi tidak membuka kembali hari yang sudah dikonfirmasi lengkap, dan makanan yang dikoreksi diberi tanda dikoreksi beserta waktunya. Tanggal di luar 7 hari ditolak server.

## Tulis & hitung (makanan tanpa foto)

- Di layar Catat, **Tulis & hitung** adalah jalan ketiga selain foto dan **Tulis manual**. Pengguna menulis apa yang dimakan beserta ukurannya, mis. "nasi 1,5 centong, ayam goreng paha 1 potong, teh manis 1 gelas". Gemini menguraikannya menjadi bahan dengan gram, kalori, dan makro, sehingga hasilnya memakai peninjauan yang sama seperti hasil foto (jumlah tiap bahan, nasi, minyak/saus, protein yang bisa diketik, keterangan untuk AI, jam makan).
- **Ukuran baku.** Satuannya sama untuk semua orang dan hidup di satu daftar (`lib/portionUnits.ts`) yang dipakai prompt AI dan bantuan di layar: 1 centong nasi = 100 g matang, 1 butir telur = 50 g, 1 potong ayam goreng ≈ 100 g tanpa tulang, 1 potong tempe/tahu ≈ 30 g, 1 mangkuk kecil sayur ≈ 200 ml, 1 gelas = 240 ml, 1 sendok makan ≈ 15 g. Angka dan satuan dihitung persis. "Kecil/sedang/besar" dibaca 0,75/1/1,5 porsi baku, dan bahan tanpa jumlah dianggap satu porsi biasa, lalu asumsinya disebut di catatan porsi. Keyakinan "tinggi" hanya bila semua bahan punya jumlah.
- **Tidak dibedakan menurut jenis kelamin.** Prompt melarang AI menyesuaikan porsi dengan jenis kelamin, usia, ukuran badan, atau tujuan, dan tidak ada data pengguna yang dikirim; yang dikirim hanya teksnya. Satu centong nasi bernilai sama bagi siapa saja. Yang berbeda adalah targetnya: kalori dan protein harian dihitung dari profil (jenis kelamin, berat, tinggi, usia, aktivitas) di Profil.
- Disimpan sebagai catatan manual (tanpa foto) dengan rincian bahan dan teks yang ditulis (maksimal 400 karakter), jadi muncul di riwayat dengan "Yang kamu tulis" dan bisa dikoreksi 7 hari ke belakang seperti makanan dari foto. Teks dikirim ke Gemini sebagai string dalam tanda kutip dan diperlakukan sebagai data, bukan perintah. Pada batas gratis Google, teks ini dapat dipakai Google untuk meningkatkan produknya, jadi jangan menulis data pribadi. Jika layanan tidak tersedia, teks tetap di layar dan pengguna bisa memakai **Tulis manual**.
- Teks yang belum dihitung ikut tersimpan sebagai draf sesi, seperti isian manual.
