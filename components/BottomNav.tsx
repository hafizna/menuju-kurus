"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconBowl, IconChartBar, IconUser } from "@/components/icons";

const ITEMS = [
  { href: "/", label: "Home", icon: IconHome },
  { href: "/makan", label: "Makan", icon: IconBowl },
  { href: "/progress", label: "Progress", icon: IconChartBar },
  { href: "/settings", label: "Profil", icon: IconUser },
];

export default function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
      <div className="mx-auto flex max-w-md justify-between px-2">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] ${
                active ? "text-brand-600 dark:text-brand-400" : "text-neutral-400"
              }`}
            >
              <Icon className={`h-5 w-5 ${active ? "" : "opacity-80"}`} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
