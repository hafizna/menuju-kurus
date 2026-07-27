"use client";

import { useState } from "react";

export default function RecoveryMode({ surplusKcal }: { surplusKcal: number }) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-2xl border border-neutral-100 bg-white p-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-center justify-between text-left">
        <div>
          <div className="text-sm font-medium">Hari ini kebablasan?</div>
          <div className="text-xs text-neutral-500">Buka rencana pemulihan tanpa puasa atau olahraga wajib.</div>
        </div>
        <span className="text-neutral-400">{open ? "−" : "+"}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3 border-t border-neutral-100 pt-4 dark:border-neutral-800">
          <p className="text-sm text-neutral-600 dark:text-neutral-300">
            Selisih sekitar {Math.round(surplusKcal)} kcal tidak merusak progres. Jangan mencoba membalasnya dengan tidak makan.
          </p>
          <ol className="space-y-2 text-sm text-neutral-600 dark:text-neutral-300">
            <li>1. Hentikan evaluasi hari ini dan lanjutkan minum sesuai kebutuhan.</li>
            <li>2. Pada waktu makan berikutnya, kembali ke porsi normal dengan protein dan sayur.</li>
            <li>3. Besok gunakan target biasa; tidak perlu memangkas kalori secara ekstrem.</li>
            <li>4. Aktivitas ringan boleh dipilih untuk suasana hati atau mengalihkan craving, bukan sebagai hukuman.</li>
          </ol>
        </div>
      )}
    </section>
  );
}
