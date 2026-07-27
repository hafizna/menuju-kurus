"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/", label: "Home", icon: "🏠" },
  { href: "/log-food", label: "Log", icon: "📷" },
  { href: "/nutrition", label: "Nutrisi", icon: "🍽️" },
  { href: "/weight", label: "Berat", icon: "⚖️" },
  { href: "/fitness", label: "Fitness", icon: "🏃" },
  { href: "/trends", label: "Tren", icon: "📈" },
  { href: "/settings", label: "Setting", icon: "⚙️" },
];

export default function BottomNav() {
  const pathname = usePathname();
  if (pathname === "/login") return null;

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 border-t border-neutral-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/95">
      <div className="mx-auto flex max-w-md justify-between px-1">
        {ITEMS.map((item) => {
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] ${active ? "text-brand-600 dark:text-brand-400" : "text-neutral-400"}`}>
              <span className="text-base leading-none">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
