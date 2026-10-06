"use client";

import { avatarHalfWidth, avatarHeight, type BodySnapshot } from "@/lib/body";

export default function BodyAvatar({
  snapshot,
  referenceHeightCm,
}: {
  snapshot: BodySnapshot;
  referenceHeightCm: number | null;
}) {
  const height = avatarHeight(snapshot);
  const waist =
    height && snapshot.waistCm
      ? avatarHalfWidth(snapshot.waistCm.value, height)
      : 25;
  const hip =
    height && snapshot.hipCm
      ? avatarHalfWidth(snapshot.hipCm.value, height)
      : 29;
  const thigh =
    height && snapshot.thighCm
      ? avatarHalfWidth(snapshot.thighCm.value, height) / 2
      : 8;
  const scale = height && referenceHeightCm ? height / referenceHeightCm : 1;
  const known = (field: "waistCm" | "hipCm" | "thighCm") =>
    !!height && !!snapshot[field];
  return (
    <figure className="min-w-0 rounded-2xl bg-neutral-50 p-3 dark:bg-neutral-950">
      <figcaption className="text-center text-xs font-medium">
        {snapshot.date}
      </figcaption>
      <svg
        viewBox="0 0 180 270"
        className="mx-auto h-56 w-full"
        role="img"
        aria-label={`Diagram titik ukur ${snapshot.date}. ${height ? `Tinggi referensi ${height} cm.` : "Tinggi referensi belum tersedia atau berbeda antarukuran; diagram tanpa skala."} Nilai ukuran ditampilkan di bawah.`}
      >
        <g
          transform={`translate(${90 * (1 - scale)} ${250 * (1 - scale)}) scale(${scale})`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <g
            className="text-neutral-300 dark:text-neutral-700"
            strokeDasharray="4 4"
          >
            <circle cx={90} cy={28} r={15} />
            <path d="M82 43 L82 54 M98 43 L98 54 M82 54 Q65 52 58 66 L43 119 L37 149 M98 54 Q115 52 122 66 L137 119 L143 149 M58 66 L65 89 M122 66 L115 89" />
          </g>
          <path
            d={`M65 89 Q${90 - waist} 102 ${90 - waist} 119 M115 89 Q${90 + waist} 102 ${90 + waist} 119`}
            className={
              known("waistCm")
                ? "text-brand-600 dark:text-brand-400"
                : "text-neutral-300 dark:text-neutral-700"
            }
            strokeDasharray={known("waistCm") ? undefined : "4 4"}
          />
          <path
            d={`M${90 - waist} 119 Q${90 - hip} 133 ${90 - hip} 150 L73 158 M${90 + waist} 119 Q${90 + hip} 133 ${90 + hip} 150 L107 158`}
            className={
              known("hipCm")
                ? "text-brand-600 dark:text-brand-400"
                : "text-neutral-300 dark:text-neutral-700"
            }
            strokeDasharray={known("hipCm") ? undefined : "4 4"}
          />
          <g
            className={
              known("thighCm")
                ? "text-brand-600 dark:text-brand-400"
                : "text-neutral-300 dark:text-neutral-700"
            }
            strokeDasharray={known("thighCm") ? undefined : "4 4"}
          >
            <path
              d={`M${73 - thigh} 156 Q${73 - thigh} 177 67 198 M${73 + thigh} 156 Q${73 + thigh} 177 81 198 M${107 - thigh} 156 Q${107 - thigh} 177 99 198 M${107 + thigh} 156 Q${107 + thigh} 177 113 198`}
            />
          </g>
          <g
            className="text-neutral-300 dark:text-neutral-700"
            strokeDasharray="4 4"
          >
            <path d="M67 198 L64 239 L58 246 L79 246 L81 198 M99 198 L101 246 L122 246 L116 239 L113 198" />
          </g>
          <g strokeWidth={1} className="text-neutral-400">
            <path d="M133 114 L158 114 M133 146 L158 146 M130 176 L158 176" />
          </g>
          <g
            fill="currentColor"
            stroke="none"
            fontSize={9}
            className="text-neutral-500"
          >
            <text x={158} y={111}>
              1
            </text>
            <text x={158} y={143}>
              2
            </text>
            <text x={158} y={173}>
              3
            </text>
          </g>
        </g>
      </svg>
      <ul className="space-y-1 text-xs text-neutral-500">
        {(
          [
            ["waistCm", "1. Pinggang"],
            ["hipCm", "2. Pinggul"],
            ["thighCm", "3. Paha"],
          ] as const
        ).map(([field, label]) => (
          <li key={field}>
            {label}:{" "}
            {snapshot[field] ? `${snapshot[field]!.value} cm` : "Belum diukur"}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-neutral-500">
        {height
          ? `Referensi tinggi: ${height} cm`
          : "Diagram titik ukur tanpa skala. Simpan tinggi referensi bersama ukuran untuk ilustrasi proporsi."}
      </p>
    </figure>
  );
}
