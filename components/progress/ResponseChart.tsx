"use client";

import type { ResponseDay } from "@/lib/bodyResponse";
export type ResponseField =
  | "calories"
  | "protein"
  | "activity"
  | "weight"
  | "waist";
export default function ResponseChart({
  days,
  field,
  label,
  unit,
}: {
  days: ResponseDay[];
  field: ResponseField;
  label: string;
  unit: string;
}) {
  const values = days.flatMap((day) =>
    day[field] === null ? [] : [day[field]!],
  );
  if (!values.length)
    return (
      <div className="rounded-lg border border-dashed border-neutral-200 p-4 text-sm text-neutral-500 dark:border-neutral-700">
        Belum ada data {label.toLowerCase()} pada periode ini.
      </div>
    );
  const width = 320,
    height = 128,
    pad = 25;
  const lower =
    field === "weight" || field === "waist"
      ? Math.max(0, Math.min(...values) - 0.5)
      : 0;
  const upper =
    Math.max(...values, lower + 1) +
    (field === "weight" || field === "waist"
      ? 0.5
      : Math.max(...values) * 0.05);
  const x = (index: number) =>
    pad + (index / Math.max(1, days.length - 1)) * (width - pad * 2);
  const y = (value: number) =>
    height - pad - ((value - lower) / (upper - lower)) * (height - pad * 2);
  const prefix = field === "calories" ? "food" : field;
  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`${label}, ${values.length}/${days.length} hari dengan data. ${days[0].date} sampai ${days.at(-1)!.date}. Angka lengkap ada di tabel catatan harian.`}
        className="w-full"
      >
        <line
          x1={pad}
          x2={width - pad}
          y1={height - pad}
          y2={height - pad}
          stroke="currentColor"
          className="text-neutral-200 dark:text-neutral-700"
        />
        <text
          x={0}
          y={pad}
          fontSize={9}
          fill="currentColor"
          className="text-neutral-500"
        >
          {Math.round(upper * 10) / 10}
        </text>
        <text
          x={0}
          y={height - pad}
          fontSize={9}
          fill="currentColor"
          className="text-neutral-500"
        >
          {Math.round(lower * 10) / 10}
        </text>
        {days.map((day, index) =>
          day[field] === null ? null : (
            <g key={day.date}>
              <circle
                cx={x(index)}
                cy={y(day[field]!)}
                r={3}
                fill="currentColor"
                className={
                  day.review.some((code) => code.startsWith(prefix))
                    ? "text-amber-600"
                    : "text-brand-600 dark:text-brand-400"
                }
              >
                <title>
                  {day.date}: {day[field]} {unit}
                  {day.review.some((code) => code.startsWith(prefix))
                    ? " · perlu ditinjau"
                    : ""}
                </title>
              </circle>
            </g>
          ),
        )}
      </svg>
      <div className="flex justify-between text-[10px] text-neutral-500">
        <span>{days[0].date}</span>
        <span>{days.at(-1)!.date}</span>
      </div>
    </div>
  );
}
