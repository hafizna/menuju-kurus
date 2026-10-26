const card = "rounded-2xl border border-neutral-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900";
const code = "rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.8rem] dark:bg-neutral-800";
const steps = "mt-2 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300";
const block = "mt-2 overflow-x-auto rounded-xl bg-neutral-100 p-3 font-mono text-xs leading-relaxed dark:bg-neutral-800";

function Section({ title, children, open = false }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-xl border border-neutral-200 p-3 dark:border-neutral-800">
      <summary className="min-h-6 cursor-pointer text-sm font-semibold">{title}</summary>
      <div className="mt-2">{children}</div>
    </details>
  );
}

// The Shortcut is built by hand in the Shortcuts app. Every field below is read
// by app/api/health-sync/route.ts; the bearer token comes from the connection above.
export default function ManualShortcutGuide({ endpoint }: { endpoint: string }) {
  return (
    <section className={`${card} space-y-3`} aria-label="Buat Shortcut sendiri">
      <div>
        <h2 className="font-semibold">Buat Shortcut sendiri (±5 menit)</h2>
        <p className="mt-1 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          Tanpa unduhan dan tanpa layanan pihak ketiga. Dipakai bila Shortcut unduhan gagal membaca data. Berat dari AFit
          lewat Apple Health sudah berhasil dikirim dengan cara ini di iPhone pemilik app; langkah untuk Apple Watch dan
          penanda waktu di bawah belum diuji di semua versi iOS.
        </p>
      </div>

      <Section title="1. Ambil token" open>
        <ol className={steps}>
          <li>Tekan <b>Siapkan koneksi</b> (atau <b>Sambungkan ulang</b>) di bagian status di atas.</li>
          <li>Tekan <b>Salin token saja</b> lalu tempel di Catatan. Token hanya tampil sekali; menutup halaman sebelum menyalin berarti membuat token baru, dan token lama berhenti berlaku.</li>
          <li>Bentuknya <span className={code}>slothly.u1.…</span> diikuti 43 karakter acak. Jangan dibagikan: token ini mengizinkan penulisan data ke akunmu.</li>
        </ol>
      </Section>

      <Section title="2. Shortcut berat dan body fat (jalan saat AFit ditutup)">
        <ol className={steps}>
          <li>Shortcuts → <b>+</b>, beri nama “Slothly Berat”.</li>
          <li>
            <b>Find Health Samples</b>: Type <b>is Weight</b>, Start Date <b>is Today</b>, Unit <b>kg</b>, Sort by <b>Start Date</b>,
            Order <b>Latest First</b>, Limit aktif dengan <b>1</b> sample.
          </li>
          <li><b>Count</b> Items dari hasil Find, lalu <b>If</b> Count <b>is 1</b>. Hasil Find hanya 0 atau 1, jadi “is 1” cukup. Tanpa data hari ini, bagian di dalam If dilewati.</li>
          <li>Di dalam If: <b>Get Value</b> dari hasil Find (Health Samples).</li>
          <li>
            <b>Get Contents of URL</b>: URL <span className={code}>{endpoint}</span>, Method <b>POST</b>, Header <span className={code}>Authorization</span> berisi{" "}
            <span className={code}>Bearer </span> (ada satu spasi) lalu tokenmu, dalam satu baris tanpa tanda kutip, tanda <span className={code}>=</span>, atau kurung sudut.
            Request Body <b>JSON</b> dengan field <span className={code}>weightKg</span> bertipe <b>Number</b> berisi hasil Get Value. Hapus angka <span className={code}>0</span> bawaan di field itu.
          </li>
          <li>
            Disarankan: tambah field <span className={code}>provider</span> (Text) <span className={code}>apple_health</span>, dan{" "}
            <span className={code}>measuredAt</span> (Text) berisi <b>Get Start Date</b> dari sample yang diformat dengan <b>Format Date</b> ISO 8601 beserta jam.
            Dengan ini berat tercatat pada waktu ukur aslinya, bukan waktu kirim.
          </li>
          <li>Uji: tambahkan <b>Show Result</b> sesudah Get Contents of URL, jalankan, dan pastikan hasilnya memuat <span className={code}>"status" : "ok"</span> dan <span className={code}>"weightKg" : true</span>. Lalu hapus Show Result.</li>
          <li>
            Body fat: salin blok Find → Count → If → Get Value → Get Contents of URL (Duplicate), ganti Type menjadi <b>Body Fat Percentage</b> dan field menjadi <span className={code}>bodyFatPercent</span>.
            Nilai harus sekitar <span className={code}>25</span>, bukan <span className={code}>0.25</span>; bila kecil, tambahkan <b>Calculate</b> × 100. Kirim sebagai request terpisah di bagian akhir agar berat tidak ikut gagal.
          </li>
          <li>
            Otomatis: tab <b>Automation</b> → <b>+</b> → <b>App</b> → AFit → <b>Is Closed</b> → Run Shortcut “Slothly Berat” → <b>Run Immediately</b>.
            Tutup AFit setelah hasil timbang tampil agar datanya sudah tertulis ke Health.
          </li>
        </ol>
      </Section>

      <Section title="3. Shortcut data Apple Watch (VO₂ max, detak istirahat, kalori)">
        <p className="text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          Buat Shortcut kedua, “Slothly Watch”, dengan blok Find → Count → If → Get Value → Get Contents of URL sendiri untuk tiap data, supaya satu yang gagal tidak menggagalkan yang lain.
          Tambahkan <span className={code}>provider</span> = <span className={code}>apple_health</span> dan <span className={code}>measuredAt</span> seperti di atas agar nilai tampil sebagai data Apple Health dengan tanggal aslinya.
        </p>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-neutral-400"><tr><th className="py-1 pr-3 font-normal">Data</th><th className="py-1 pr-3 font-normal">Type di Find</th><th className="py-1 pr-3 font-normal">Rentang</th><th className="py-1 font-normal">Field</th></tr></thead>
            <tbody>
              <tr className="border-t border-neutral-100 dark:border-neutral-800"><td className="py-1.5 pr-3">Detak istirahat</td><td className="pr-3">Resting Heart Rate</td><td className="pr-3">in the last 2 days</td><td><span className={code}>restingHeartRate</span> (30–140)</td></tr>
              <tr className="border-t border-neutral-100 dark:border-neutral-800"><td className="py-1.5 pr-3">VO₂ max</td><td className="pr-3">Cardio Fitness</td><td className="pr-3">in the last 30 days</td><td><span className={code}>vo2Max</span> (10–90)</td></tr>
              <tr className="border-t border-neutral-100 dark:border-neutral-800"><td className="py-1.5 pr-3">Kalori aktif (opsional)</td><td className="pr-3">Active Energy</td><td className="pr-3">is Today, jumlahkan semua sample</td><td><span className={code}>calories</span> (0–20000)</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          Untuk detak istirahat dan VO₂ max pakai Limit 1 (Latest First). Untuk kalori jangan pakai Limit: ambil Value semua sample hari ini lalu jumlahkan dengan <b>Calculate Statistics → Sum</b>; app menimpa satu catatan per hari, jadi aman dijalankan berulang.
          Pemicu yang cocok: <b>Time of Day</b> sekitar 21:30 dengan Run Immediately. Uji dengan mengunci iPhone sebelum waktunya; bila data tidak terbaca saat terkunci, pindahkan blok ini ke Shortcut berat.
        </p>
      </Section>

      <Section title="Format yang diterima server">
        <pre className={block}>{`POST ${endpoint}
Authorization: Bearer <token>
Content-Type: application/json

{
  "provider": "apple_health",
  "measuredAt": "2026-10-26T18:19:00+07:00",
  "weightKg": 93.4,
  "bodyFatPercent": 28.1
}`}</pre>
        <p className="mt-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          Semua field data opsional (<span className={code}>weightKg</span>, <span className={code}>bodyFatPercent</span>, <span className={code}>vo2Max</span>, <span className={code}>restingHeartRate</span>, <span className={code}>calories</span>), tetapi minimal satu harus ada.
          <span className={code}>measuredAt</span> harus lengkap dengan jam dan zona waktu, dan hanya diterima bersama <span className={code}>provider</span>; bila dihilangkan dipakai waktu kirim. Satu field di luar rentang menolak seluruh permintaan, itu sebabnya tiap data sebaiknya dikirim terpisah.
        </p>
      </Section>

      <Section title="Kalau gagal">
        <ul className="space-y-2 text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
          <li><span className={code}>connection_invalid</span>: token tidak terbaca. Periksa header: key <span className={code}>Authorization</span>, nilai <span className={code}>Bearer</span> + spasi + token, tanpa <span className={code}>=</span> atau kurung. Bila masih gagal, tekan Sambungkan ulang dan salin token baru.</li>
          <li><span className={code}>request_invalid</span>: angka terkirim sebagai teks (mis. “93.4 kg”) atau di luar rentang, atau ada angka 0 bawaan di depan variabel. Tambahkan <b>Get Numbers from Input</b>, atau perbaiki <span className={code}>measuredAt</span> (butuh jam dan zona waktu).</li>
          <li>“The network connection was lost”: koneksi putus sebelum ada jawaban. Periksa header yang rusak, lalu coba lewat Wi-Fi.</li>
          <li>“This shortcut can’t access …”: izinkan domain ini saat popup muncul, atau di pengaturan Shortcut (ikon ⓘ).</li>
          <li>Count 0 atau tidak ada data: AFit belum menulis ke Health. Cek Health → Berat badan dan sumbernya.</li>
          <li><span className={code}>received: 0</span> dengan <span className={code}>ignored</span> ≥ 1 bukan error: nilai itu sudah ada atau lebih lama dari yang tersimpan.</li>
        </ul>
      </Section>
    </section>
  );
}
