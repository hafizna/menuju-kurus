"use client";

// Small form pieces shared by the meal flow: logging a new meal, reviewing a
// photo estimate, and correcting a meal that was saved earlier.

export function nowHHMM(timezone?: string): string {
  const d = new Date();
  if (timezone) return new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function MealTimeField({ value, onChange, timezone }: { value: string; onChange: (v: string) => void; timezone?: string }) {
  return (
    <label className="flex items-center justify-between gap-3 text-sm">
      <span className="text-neutral-500">Jam makan{timezone && <span className="block text-[10px]">{timezone}</span>}</span>
      <span className="flex items-center gap-2">
        <input
          type="time"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="rounded-lg border border-neutral-300 px-3 py-1.5 tabular-nums"
        />
        <button type="button" onClick={() => onChange(nowHHMM(timezone))} className="text-xs font-medium text-brand-600">
          Sekarang
        </button>
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: Array<[T, string]>;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-neutral-500">{label}</span>
      <div className="flex gap-1 rounded-xl bg-neutral-100 p-1" role="radiogroup" aria-label={label}>
        {options.map(([optionValue, text]) => (
          <button
            key={optionValue}
            type="button"
            role="radio"
            aria-checked={value === optionValue}
            onClick={() => onChange(optionValue)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              value === optionValue ? "bg-white text-brand-700 shadow-xs" : "text-neutral-500"
            }`}
          >
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}
