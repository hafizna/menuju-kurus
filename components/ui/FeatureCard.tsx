import Link from "next/link";
import type { ReactNode } from "react";

// One idea per card: icon chip, small label, one big value, one-line caption,
// and an optional status chip. Long explanations belong behind a link.
const TONES = {
  green: "bg-brand-50 text-brand-600",
  violet: "bg-violet-50 text-violet-600",
  amber: "bg-amber-50 text-amber-600",
  orange: "bg-orange-50 text-orange-600",
  sky: "bg-sky-50 text-sky-600",
} as const;

export default function FeatureCard({
  href,
  icon,
  label,
  value,
  caption,
  chip,
  wide,
  tone = "green",
}: {
  href: string;
  icon: ReactNode;
  label: string;
  value: string;
  caption?: string;
  chip?: string;
  wide?: boolean;
  tone?: keyof typeof TONES;
}) {
  return (
    <Link
      href={href}
      className={`${wide ? "col-span-2 " : ""}flex flex-col rounded-2xl border border-neutral-100 bg-white p-3.5 shadow-xs transition-transform active:scale-[0.98]`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${TONES[tone]}`}>
          {icon}
        </span>
        {chip && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
            {chip}
          </span>
        )}
      </div>
      <div className="mt-2.5 text-xs text-neutral-500">{label}</div>
      <div className="font-display mt-0.5 text-lg font-semibold leading-tight tabular-nums">{value}</div>
      {caption && <div className="mt-0.5 text-xs leading-snug text-neutral-400">{caption}</div>}
    </Link>
  );
}
