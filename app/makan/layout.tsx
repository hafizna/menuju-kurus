"use client";

import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

function linkClass(active: boolean): string {
  return `rounded-xl px-1 py-2.5 text-center text-xs font-medium transition-colors ${
    active
      ? "bg-white text-brand-800 shadow-xs"
      : "text-neutral-500 hover:text-neutral-700"
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
    <nav aria-label="Pilihan makan" className="grid grid-cols-4 gap-1 rounded-2xl border border-brand-100 bg-brand-50/60 p-1">
      <Link href="/makan" aria-current={catatActive ? "page" : undefined} className={linkClass(catatActive)}>
        Catat
      </Link>
      <Link href="/makan?mode=cari" aria-current={cariActive ? "page" : undefined} className={linkClass(cariActive)}>
        Ide makan
      </Link>
      <Link href="/makan/restaurant" aria-current={restaurantActive ? "page" : undefined} className={linkClass(restaurantActive)}>
        Restoran
      </Link>
      <Link href="/makan/habits" aria-current={habitsActive ? "page" : undefined} className={linkClass(habitsActive)}>
        Favorit
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
