"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Mascot from "@/components/Mascot";
import SkyBackdrop, { skyBackground, useSkyAfterMount } from "@/components/SkyBackdrop";

function LoginScreen() {
  const sky = useSkyAfterMount();
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";

  const [mode, setMode] = useState<"landing" | "pin" | "invite">("landing");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleInviteSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Gagal masuk");
        return;
      }
      router.replace("/account/set-pin");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function handlePinSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Gagal masuk");
        return;
      }
      router.replace(next);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col" style={{ background: skyBackground(sky) }}>
      <div className="relative isolate flex flex-1 flex-col items-center justify-end overflow-hidden px-6 pb-10 pt-16 text-white">
        <SkyBackdrop sky={sky} />
        <Mascot mood="happy" className="mb-2 h-32 w-32" />
        <h1 className="text-5xl font-semibold">Slothly</h1>
        <p className="font-display mt-1 text-lg font-medium text-white/90">sehat pelan-pelan, tanpa drama</p>
      </div>

      <div className="rounded-t-3xl bg-neutral-50 px-6 pb-10 pt-8 dark:bg-neutral-950">
        <div className="mx-auto w-full max-w-xs">
          {error && <p className="mb-4 text-center text-sm text-red-500">{error}</p>}

          {mode === "landing" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => {
                  setMode("pin");
                  setError("");
                }}
                className="w-full rounded-xl bg-brand-600 py-3.5 font-medium text-white"
              >
                Masuk dengan PIN
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("invite");
                  setError("");
                }}
                className="w-full rounded-xl border border-neutral-200 bg-white py-3.5 font-medium text-neutral-700 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
              >
                Punya kode undangan
              </button>
              <p className="text-center text-xs text-neutral-400">
                Baru pertama kali? Masukkan kode undangan dari admin, lalu bikin PIN-mu sendiri.
              </p>
            </div>
          )}

          {mode === "pin" && (
            <form onSubmit={handlePinSubmit} className="space-y-3">
              <p className="text-center text-sm text-neutral-500">Masukkan PIN</p>
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
              <button
                type="submit"
                disabled={loading || pin.length !== 6}
                className="w-full rounded-xl bg-brand-600 py-3.5 font-medium text-white transition-opacity disabled:opacity-50"
              >
                {loading ? "Masuk..." : "Masuk"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("landing");
                  setError("");
                }}
                className="w-full text-center text-sm text-neutral-400"
              >
                Kembali
              </button>
            </form>
          )}

          {mode === "invite" && (
            <form onSubmit={handleInviteSubmit} className="space-y-3">
              <p className="text-center text-sm text-neutral-500">Masukkan kode undangan</p>
              <input
                type="text"
                autoFocus
                autoCapitalize="none"
                autoCorrect="off"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="kode undangan"
                className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-center text-lg outline-hidden focus:border-brand-500 dark:border-neutral-800 dark:bg-neutral-900"
              />
              <button
                type="submit"
                disabled={loading || !code.trim()}
                className="w-full rounded-xl bg-brand-600 py-3.5 font-medium text-white transition-opacity disabled:opacity-50"
              >
                {loading ? "Memeriksa..." : "Lanjut"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("landing");
                  setError("");
                }}
                className="w-full text-center text-sm text-neutral-400"
              >
                Kembali
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
