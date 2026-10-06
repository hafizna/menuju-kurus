"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { IconBowl } from "@/components/icons";

export default function SetPinPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/account/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin, confirmPin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Gagal menyimpan PIN");
        return;
      }
      router.replace("/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-linear-to-br from-brand-600 via-brand-700 to-brand-800">
      <div className="flex flex-1 flex-col items-center justify-end px-6 pb-10 pt-16 text-white">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
          <IconBowl className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold">Buat PIN</h1>
        <p className="mt-1 text-sm text-brand-100">
          Dipakai untuk masuk cepat sehari-hari, tanpa Google tiap kali
        </p>
      </div>

      <div className="rounded-t-3xl bg-neutral-50 px-6 pb-10 pt-8 dark:bg-neutral-950">
        <form onSubmit={handleSubmit} className="mx-auto w-full max-w-xs space-y-3">
          <div>
            <p className="mb-1 text-center text-sm text-neutral-500">PIN baru (6 digit)</p>
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              maxLength={6}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••••"
              className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-center text-xl tracking-[0.5em] outline-hidden focus:border-brand-500 dark:border-neutral-800 dark:bg-neutral-900"
            />
          </div>
          <div>
            <p className="mb-1 text-center text-sm text-neutral-500">Ulangi PIN</p>
            <input
              type="password"
              inputMode="numeric"
              maxLength={6}
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
              placeholder="••••••"
              className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-center text-xl tracking-[0.5em] outline-hidden focus:border-brand-500 dark:border-neutral-800 dark:bg-neutral-900"
            />
          </div>
          {error && <p className="text-center text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={loading || pin.length !== 6 || confirmPin.length !== 6}
            className="w-full rounded-xl bg-brand-600 py-3.5 font-medium text-white transition-opacity disabled:opacity-50"
          >
            {loading ? "Menyimpan..." : "Simpan PIN"}
          </button>
        </form>
      </div>
    </div>
  );
}
