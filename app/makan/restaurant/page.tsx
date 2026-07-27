"use client";

import RestaurantIntelligence from "@/components/RestaurantIntelligence";

export default function RestaurantPage() {
  return (
    <div className="space-y-4 p-4">
      <header className="pt-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand-600 dark:text-brand-400">Restaurant Intelligence</p>
        <h1 className="mt-1 text-xl font-bold">Makan di luar tanpa menebak-nebak</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Cari menu Indonesia, sesuaikan asumsi porsi, lalu catat tanpa perlu mengambil foto.
        </p>
      </header>

      <RestaurantIntelligence onSaved={() => undefined} />
    </div>
  );
}
