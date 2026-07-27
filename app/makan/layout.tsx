import type { ReactNode } from "react";
import Link from "next/link";

export default function MakanLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="px-4 pt-4">
        <nav className="grid grid-cols-2 gap-1 rounded-2xl border border-neutral-100 bg-neutral-100 p-1 dark:border-neutral-800 dark:bg-neutral-900">
          <Link
            href="/makan"
            className="rounded-xl bg-white px-3 py-2.5 text-center text-xs font-medium text-neutral-700 shadow-sm dark:bg-neutral-800 dark:text-neutral-200"
          >
            Foto & rekomendasi
          </Link>
          <Link
            href="/makan/restaurant"
            className="rounded-xl px-3 py-2.5 text-center text-xs font-medium text-brand-700 dark:text-brand-300"
          >
            Menu restoran
          </Link>
        </nav>
      </div>
      {children}
    </>
  );
}
