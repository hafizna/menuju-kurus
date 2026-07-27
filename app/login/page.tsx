"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconBowl } from "@/components/icons";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pin }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "Gagal login");
        return;
      }
      router.replace(params.get("next") || "/");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-brand-600 via-brand-700 to-brand-800">
      <div className="flex flex-1 flex-col items-center justify-end px-6 pb-10 pt-16 text-white">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
          <IconBowl className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold">menuju kurus</h1>
        <p className="mt-1 text-sm text-brand-100">Kalori, berat, dan keputusan makan harian</p>
      </div>

      <div className="rounded-t-3xl bg-neutral-50 px-6 pb-10 pt-8 dark:bg-neutral-950">
        <div className="mx-auto w-full max-w-xs">
          <p className="mb-4 text-center text-sm text-neutral-500">Masukkan PIN untuk lanjut</p>
          <form onSubmit={handleSubmit} className="space-y-3">
            <input
              type="password"
              inputMode="numeric"
              autoFocus
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="••••••"
              className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3.5 text-center text-xl tracking-[0.5em] outline-none focus:border-brand-500 dark:border-neutral-800 dark:bg-neutral-900"
            />
            {error && <p className="text-center text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={loading || !pin}
              className="w-full rounded-xl bg-brand-600 py-3.5 font-medium text-white transition-opacity disabled:opacity-50"
            >
              {loading ? "Masuk..." : "Masuk"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
