"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { findWeeklyFocus, WEEKLY_FOCUS_OPTIONS, type WeeklyFocus } from "@/lib/weeklyFocus";

interface FocusResponse { focus: WeeklyFocus | null; reviewDue: boolean; today: string }

export default function WeeklyFocusCard({ editable = false }: { editable?: boolean }) {
  const [data, setData] = useState<FocusResponse | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [choosing, setChoosing] = useState(false);
  const load = useCallback(async () => {
    setError("");
    try {
      const res = await fetch("/api/weekly-focus");
      if (!res.ok) throw new Error("Fokus belum dapat dimuat.");
      setData(await res.json());
    } catch (e) { setError(e instanceof Error ? e.message : "Fokus belum dapat dimuat."); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function save(action: "select" | "complete", id?: string) {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/weekly-focus", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id: id ?? data?.focus?.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error ?? "Fokus belum tersimpan.");
      setData(result); setChoosing(false);
    } catch (e) { setError(e instanceof Error ? e.message : "Fokus belum tersimpan."); }
    finally { setSaving(false); }
  }
  const option = findWeeklyFocus(data?.focus?.id);
  return (
    <section className="space-y-3 rounded-2xl border border-brand-100 bg-brand-50 p-4 dark:border-brand-900 dark:bg-brand-950/30" aria-label="Fokus mingguan">
      <h2 className="text-sm font-semibold">Satu fokus untuk minggu ini</h2>
      {error && <div><p role="alert" className="text-sm text-red-500">{error}</p>{!data && <button type="button" onClick={() => void load()} className="mt-2 rounded-lg border px-3 py-2 text-sm">Coba lagi</button>}</div>}
      {!data ? !error && <p role="status" className="text-sm text-neutral-500">Memuat fokus...</p> : option && data.focus ? (
        <>
          <p className="font-medium">{option.label}</p>
          <p className="text-sm text-neutral-600 dark:text-neutral-300">{option.detail}</p>
          <p className="text-xs text-neutral-500">Dipilih {data.focus.selectedOn} · tinjau {data.focus.reviewOn}</p>
          {data.reviewDue ? <Link href="/progress?tab=overview#minggu-ini" className="inline-block rounded-lg bg-brand-600 px-3 py-2 text-sm text-white">Saatnya tinjau fokus</Link> : data.focus.completedOn ? (
            <p role="status" className="text-sm text-brand-700 dark:text-brand-300">Sudah kamu tandai tercapai pada {data.focus.completedOn}. Lanjutkan ritme yang terasa cocok.</p>
          ) : <div className="flex flex-wrap gap-2">
            <Link href={option.href} className="rounded-lg bg-brand-600 px-3 py-2 text-sm text-white">{option.actionLabel}</Link>
            <button type="button" disabled={saving} onClick={() => void save("complete")} className="rounded-lg border border-brand-200 px-3 py-2 text-sm disabled:opacity-50">{saving ? "Menyimpan..." : "Tandai tercapai"}</button>
          </div>}
          {editable ? <button type="button" onClick={() => setChoosing(!choosing)} className="text-xs font-medium underline">{choosing ? "Tutup pilihan" : data.reviewDue ? "Pilih fokus berikutnya" : "Ubah fokus"}</button> : <Link href="/progress?tab=overview#minggu-ini" className="inline-block text-xs font-medium underline">Lihat review mingguan</Link>}
        </>
      ) : <>
        <p className="text-sm text-neutral-600 dark:text-neutral-300">Pilih satu kebiasaan kecil untuk dicoba selama 7 hari. Fokusmu akan muncul di Home.</p>
        {!editable && <Link href="/progress?tab=overview#minggu-ini" className="inline-block rounded-lg bg-brand-600 px-3 py-2 text-sm text-white">Pilih fokus</Link>}
      </>}
      {editable && data && (!option || choosing) && <div className="grid gap-2">
        {WEEKLY_FOCUS_OPTIONS.map((item) => <button type="button" key={item.id} disabled={saving} onClick={() => void save("select", item.id)} className="rounded-xl border border-brand-100 bg-white px-3 py-3 text-left text-sm disabled:opacity-50 dark:border-brand-900 dark:bg-neutral-900">{item.label}</button>)}
      </div>}
    </section>
  );
}
