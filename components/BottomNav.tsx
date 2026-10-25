"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IconHome, IconBowl, IconChartBar, IconUser } from "@/components/icons";
import Mascot from "@/components/Mascot";

const ITEMS = [
  { href: "/", label: "Hari ini", icon: IconHome },
  { href: "/makan", label: "Makan", icon: IconBowl },
  { href: "/progress", label: "Perjalanan", icon: IconChartBar },
  { href: "/settings", label: "Profil", icon: IconUser },
];

const HIDDEN = ["/login", "/onboarding", "/account/set-pin"];

export default function BottomNav() {
  const pathname = usePathname();
  if (HIDDEN.some((p) => pathname.startsWith(p))) return null;

  return (
    <nav className="slothly-nav" aria-label="Navigasi utama">
      <Link href="/" className="slothly-nav-brand" aria-label="Slothly, hari ini">
        <Mascot className="h-20 w-20 -ml-2" decorative />
        <strong>Slothly</strong>
        <span>Pelan-pelan, tetap jalan.</span>
      </Link>
      <div className="slothly-nav-items">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className="slothly-nav-link"
              aria-current={active ? "page" : undefined}
            >
              <span className="slothly-nav-icon"><Icon className="h-5 w-5" /></span>
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
