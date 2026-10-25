import Link from "next/link";
import type { ReactNode } from "react";

// One idea per card: icon chip, small label, one big value, one-line caption,
// and an optional status chip. Long explanations belong behind a link.
export default function FeatureCard({
  href,
  icon,
  label,
  value,
  caption,
  chip,
  wide,
}: {
  href: string;
  icon: ReactNode;
  label: string;
  value: string;
  caption?: string;
  chip?: string;
  wide?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`${wide ? "col-span-2 " : ""}flex flex-col rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-xs transition-transform active:scale-[0.98] dark:border-neutral-800 dark:bg-neutral-900`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-900/30 dark:text-brand-400">
          {icon}
        </span>
        {chip && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            {chip}
          </span>
        )}
      </div>
      <div className="mt-2.5 text-xs text-neutral-500">{label}</div>
      <div className="mt-0.5 text-lg font-bold leading-tight tabular-nums">{value}</div>
      {caption && <div className="mt-0.5 text-xs leading-snug text-neutral-400">{caption}</div>}
    </Link>
  );
}
