"use client";

import { useEffect, useRef } from "react";
import Mascot, { type MascotMood } from "@/components/Mascot";

export type SheetPhase = "upload" | "read" | "done" | "error";

function Step({ state, label, extra }: { state: "done" | "active" | "pending"; label: string; extra?: string }) {
  return (
    <li className="flex items-center gap-3">
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
          state === "done"
            ? "bg-brand-600 text-white"
            : state === "active"
              ? "bg-neutral-200 dark:bg-neutral-700"
              : "bg-neutral-200/60 dark:bg-neutral-800"
        }`}
      >
        {state === "done" && (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12 5 5 9-10" />
          </svg>
        )}
        {state === "active" && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent motion-reduce:animate-none" />
        )}
      </span>
      <span className={`flex-1 text-[15px] ${state === "pending" ? "text-neutral-400" : "font-medium"}`}>{label}</span>
      {extra && <span className="text-xs tabular-nums text-neutral-400">{extra}</span>}
    </li>
  );
}

export default function AnalysisSheet({
  phase,
  seconds,
  preview,
  error,
  onCancel,
  onRetry,
  onManual,
}: {
  phase: SheetPhase;
  seconds: number;
  preview: string | null;
  error: string;
  onCancel: () => void;
  onRetry: () => void;
  onManual: () => void;
}) {
  const mood: MascotMood = phase === "error" ? "worried" : phase === "done" ? "cheer" : "thinking";
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef(onCancel);
  cancelRef.current = onCancel;
  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialogRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); cancelRef.current(); return; }
      if (event.key !== "Tab") return;
      const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ?? [])].filter(button => button.getClientRects().length > 0);
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    document.addEventListener("keydown", keydown);
    return () => { document.removeEventListener("keydown", keydown); document.body.style.overflow = previousOverflow; if (previousFocus?.isConnected) previousFocus.focus(); };
  }, []);
  const uploadState = phase === "upload" ? "active" : "done";
  const readState = phase === "upload" ? "pending" : phase === "read" || phase === "error" ? "active" : "done";

  return (
    <div ref={dialogRef} className="fixed inset-0 z-40 flex items-end bg-black/40" role="dialog" aria-modal="true" aria-label="Membaca foto makanan">
      <div className="mx-auto w-full max-w-md rounded-t-3xl bg-neutral-50 px-5 pb-8 pt-3 dark:bg-neutral-950">
        <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-neutral-300 dark:bg-neutral-700" />
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold">Membaca makananmu</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Batalkan"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-200/70 text-lg dark:bg-neutral-800"
          >
            ✕
          </button>
        </div>

        {preview && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="h-52 w-full rounded-2xl object-cover" />
        )}

        <div className="mt-3 rounded-2xl bg-white p-4 shadow-xs dark:bg-neutral-900">
          {phase === "error" ? (
            <div className="space-y-3 text-center">
              <Mascot mood={mood} className="mx-auto h-16 w-16" />
              <p role="alert" className="text-sm text-neutral-700 dark:text-neutral-200">
                {error}
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={onRetry} className="rounded-xl border border-neutral-300 py-2.5 text-sm font-medium dark:border-neutral-700">
                  Coba lagi
                </button>
                <button onClick={onManual} className="rounded-xl bg-brand-600 py-2.5 text-sm font-medium text-white">
                  Isi manual saja
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <Mascot mood={mood} className="h-16 w-16 shrink-0" />
              <ol className="flex-1 space-y-3" aria-live="polite">
                <Step state={uploadState} label="Mengirim foto" />
                <Step state={readState} label="Membaca makanannya" extra={phase === "read" ? `${seconds} dtk` : undefined} />
                <Step state={phase === "done" ? "done" : "pending"} label="Siap kamu cek" />
              </ol>
            </div>
          )}
        </div>

        {phase !== "error" && (
          <>
            <p className="mt-3 text-center text-sm text-neutral-500">Biasanya cuma beberapa detik.</p>
            <p className="mt-1 text-center text-xs text-neutral-400">
              AI menebak nama makanan, porsi, dan kalorinya. Kamu cek dulu sebelum disimpan, ya.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
