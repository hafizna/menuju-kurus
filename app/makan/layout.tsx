"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

function linkClass(active: boolean): string {
  return `rounded-xl px-1 py-2.5 text-center text-xs font-medium transition-colors ${
    active
      ? "bg-white text-brand-700 shadow-xs dark:bg-neutral-800 dark:text-brand-300"
      : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
  }`;
}

function MakanNav() {
  const pathname = usePathname();
  const mode = useSearchParams().get("mode");
  const restaurantActive = pathname.startsWith("/makan/restaurant");
  const habitsActive = pathname.startsWith("/makan/habits");
  const cariActive = !restaurantActive && !habitsActive && mode === "cari";
  const catatActive = !restaurantActive && !habitsActive && !cariActive;

  return (
    <nav className="grid grid-cols-4 gap-1 rounded-2xl border border-neutral-100 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-900">
      <Link href="/makan" className={linkClass(catatActive)}>
        Catat
      </Link>
      <Link href="/makan?mode=cari" className={linkClass(cariActive)}>
        Rekomendasi
      </Link>
      <Link href="/makan/restaurant" className={linkClass(restaurantActive)}>
        Restoran
      </Link>
      <Link href="/makan/habits" className={linkClass(habitsActive)}>
        Sering
      </Link>
    </nav>
  );
}

export default function MakanLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="px-4 pt-4">
        <Suspense fallback={null}>
          <MakanNav />
        </Suspense>
      </div>
      {children}
    </>
  );
}
