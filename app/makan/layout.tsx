"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

function linkClass(active: boolean): string {
  return `rounded-xl px-3 py-2.5 text-center text-xs font-medium transition-colors ${
    active
      ? "bg-white text-brand-700 shadow-sm dark:bg-neutral-800 dark:text-brand-300"
      : "text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-200"
  }`;
}

export default function MakanLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const restaurantActive = pathname.startsWith("/makan/restaurant");

  return (
    <>
      <div className="px-4 pt-4">
        <nav className="grid grid-cols-2 gap-1 rounded-2xl border border-neutral-100 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-900">
          <Link href="/makan" className={linkClass(!restaurantActive)}>
            Foto & rekomendasi
          </Link>
          <Link href="/makan/restaurant" className={linkClass(restaurantActive)}>
            Menu restoran
          </Link>
        </nav>
      </div>
      {children}
    </>
  );
}
