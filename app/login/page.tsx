"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { IconBowl } from "@/components/icons";

const ERROR_MESSAGES: Record<string, string> = {
  not_allowed: "Email Google ini belum terdaftar. Minta admin menambahkannya dulu.",
  google_failed: "Gagal masuk dengan Google. Coba lagi.",
  state_mismatch: "Sesi login kedaluwarsa. Coba lagi.",
  google_not_configured: "Login Google belum diatur di server.",
};

function LoginScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") || "/";
  const errorParam = params.get("error");

  const [mode, setMode] = useState<"landing" | "pin">("landing");
  const [pin, setPin] = useState("");
  const [error, setError] = useState(
    errorParam ? ERROR_MESSAGES[errorParam] || "Gagal masuk. Coba lagi." : "",
  );
  const [loading, setLoading] = useState(false);

  const googleHref = `/api/auth/google?next=${encodeURIComponent(next)}`;

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
    <div className="flex min-h-screen flex-col bg-linear-to-br from-brand-600 via-brand-700 to-brand-800">
      <div className="flex flex-1 flex-col items-center justify-end px-6 pb-10 pt-16 text-white">
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-white/15">
          <IconBowl className="h-7 w-7" />
        </div>
        <h1 className="text-2xl font-bold">menuju kurus</h1>
        <p className="mt-1 text-sm text-brand-100">Kalori, berat, dan keputusan makan harian</p>
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
              <a
                href={googleHref}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-white py-3.5 font-medium text-neutral-700 shadow-xs dark:border-neutral-800 dark:bg-neutral-900 dark:text-neutral-100"
              >
                <GoogleLogo className="h-5 w-5" />
                Daftar / masuk dengan Google
              </a>
              <p className="text-center text-xs text-neutral-400">
                Pertama kali di sini, atau lupa PIN? Pakai Google.
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
        </div>
      </div>
    </div>
  );
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.9 32.6 29.4 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.1 8 3l5.7-5.7C34.5 6.1 29.5 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.3 0 10.1-2 13.7-5.3l-6.3-5.3C29.4 35.4 26.8 36 24 36c-5.3 0-9.8-3.4-11.3-8.1l-6.6 5.1C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.1-3.3 5.6-6.1 7.1l6.3 5.3C39.9 37 44 31.1 44 24c0-1.3-.1-2.7-.4-3.5z"
      />
    </svg>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
