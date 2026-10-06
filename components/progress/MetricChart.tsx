"use client";

import {
  metricPoints,
  BODY_LABELS,
  type BodyField,
  type BodySnapshot,
} from "@/lib/body";

export default function MetricChart({
  snapshots,
  field,
}: {
  snapshots: BodySnapshot[];
  field: BodyField;
}) {
  const points = metricPoints(snapshots, field);
  const meta = BODY_LABELS[field];
  if (!points.length)
    return (
      <p className="py-6 text-center text-sm text-neutral-500">
        Belum ada pengukuran {meta.label.toLowerCase()} pada periode ini.
      </p>
    );
  const width = 320,
    height = 150,
    padding = 24;
  const from = Date.parse(snapshots[0]?.date ?? points[0].date);
  const to = Date.parse(snapshots.at(-1)?.date ?? points.at(-1)!.date);
  const values = points.flatMap((point) =>
    point.average7 === null ? [point.value] : [point.value, point.average7],
  );
  const min = Math.min(...values) - 0.5,
    max = Math.max(...values) + 0.5;
  const x = (date: string) =>
    to === from
      ? width / 2
      : padding +
        ((Date.parse(date) - from) / (to - from)) * (width - padding * 2);
  const y = (value: number) =>
    height - padding - ((value - min) / (max - min)) * (height - padding * 2);
  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${meta.label}: ${points.length} pengukuran dari ${points[0].date} sampai ${points.at(-1)!.date}. Tabel angka tersedia di bawah.`}
      >
        <line
          x1={padding}
          x2={width - padding}
          y1={height - padding}
          y2={height - padding}
          stroke="currentColor"
          className="text-neutral-200 dark:text-neutral-700"
        />
        <text
          x={2}
          y={padding}
          fontSize={10}
          fill="currentColor"
          className="text-neutral-500"
        >
          {max.toFixed(1)}
        </text>
        <text
          x={2}
          y={height - padding}
          fontSize={10}
          fill="currentColor"
          className="text-neutral-500"
        >
          {min.toFixed(1)}
        </text>
        {points.map((point, index) => {
          const previous = points[index - 1];
          // No connection over missing dates; circumference stays as actual points.
          const adjacent =
            previous &&
            Date.parse(point.date) - Date.parse(previous.date) === 86400000;
          return (
            <g key={point.date}>
              {field === "weightKg" &&
                adjacent &&
                previous.average7 !== null &&
                point.average7 !== null && (
                  <line
                    x1={x(previous.date)}
                    y1={y(previous.average7)}
                    x2={x(point.date)}
                    y2={y(point.average7)}
                    stroke="currentColor"
                    strokeWidth={2}
                    className="text-brand-600"
                  />
                )}
              <circle
                cx={x(point.date)}
                cy={y(point.value)}
                r={3.5}
                fill="currentColor"
                className="text-neutral-600 dark:text-neutral-300"
              >
                <title>
                  {point.date}: {point.value} {meta.unit}
                </title>
              </circle>
              {point.average7 !== null && (
                <rect
                  x={x(point.date) - 2.5}
                  y={y(point.average7) - 2.5}
                  width={5}
                  height={5}
                  fill="currentColor"
                  className="text-brand-600"
                >
                  <title>
                    Rata-rata 7 hari: {point.average7} {meta.unit},{" "}
                    {point.samples7} sampel
                  </title>
                </rect>
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex justify-between text-xs text-neutral-500">
        <span>{snapshots[0]?.date}</span>
        <span>{snapshots.at(-1)?.date}</span>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        {points.length} pengukuran · titik bulat: ukuran tercatat
        {field === "weightKg" &&
          " · kotak hijau: rata-rata kalender 7 hari, minimal 2 sampel"}
        . Tanggal tanpa ukuran dibiarkan kosong.
      </p>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer text-neutral-500">
          Lihat angka dan tanggal
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Pengukuran {meta.label}</caption>
            <thead>
              <tr>
                <th className="py-2">Tanggal</th>
                <th>{meta.label}</th>
                {field === "weightKg" && <th>Rata-rata 7 hari</th>}
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr
                  key={point.date}
                  className="border-t border-neutral-100 dark:border-neutral-800"
                >
                  <td className="py-2">{point.date}</td>
                  <td>
                    {point.value} {meta.unit}
                  </td>
                  {field === "weightKg" && (
                    <td>
                      {point.average7 === null
                        ? "—"
                        : `${point.average7} ${meta.unit} (${point.samples7} sampel)`}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
