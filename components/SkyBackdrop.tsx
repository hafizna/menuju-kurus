"use client";

import { useEffect, useState } from "react";
import { skyForHour, SKY_GRADIENT, type SkyId } from "@/lib/skyTheme";

// For server-rendered pages: starts on "siang" so hydration matches, then
// switches to the real time of day right after mount.
export function useSkyAfterMount(): SkyId {
  const [sky, setSky] = useState<SkyId>("siang");
  useEffect(() => setSky(skyForHour(new Date().getHours())), []);
  return sky;
}

export function skyBackground(sky: SkyId): string {
  return SKY_GRADIENT[sky];
}

function Cloud({ x, y, scale, opacity, drift }: { x: number; y: number; scale: number; opacity: number; drift: string }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={opacity}>
      <g className={`sky-drift ${drift}`}>
        <ellipse cx="0" cy="0" rx="26" ry="9" fill="#fff" />
        <ellipse cx="-14" cy="-6" rx="13" ry="9" fill="#fff" />
        <ellipse cx="9" cy="-9" rx="15" ry="11" fill="#fff" />
      </g>
    </g>
  );
}

const STARS: Array<[number, number, number]> = [
  [40, 40, 1.4], [90, 90, 1], [150, 30, 1.2], [210, 70, 1], [260, 24, 1.3],
  [300, 120, 1], [60, 140, 1.1], [180, 130, 0.9], [350, 30, 1], [120, 60, 0.9],
];

// Decorative only: sun/moon, clouds or stars, and soft hills. Sits behind
// content (parent must be `relative isolate overflow-hidden`).
export default function SkyBackdrop({ sky }: { sky: SkyId }) {
  const night = sky === "malam";
  return (
    <svg
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
      viewBox="0 0 400 300"
      preserveAspectRatio="xMaxYMin slice"
      aria-hidden="true"
    >
      {night ? (
        <>
          {STARS.map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#fff" opacity="0.8" />
          ))}
          <circle cx="332" cy="62" r="19" fill="#fef9c3" />
          <circle cx="341" cy="56" r="17" fill="#241f5c" />
        </>
      ) : (
        <>
          {sky === "sore" ? (
            <>
              <circle cx="336" cy="74" r="56" fill="#fdba74" opacity="0.2" />
              <circle cx="336" cy="74" r="30" fill="#fdba74" opacity="0.95" />
            </>
          ) : (
            <>
              <circle cx="334" cy="62" r="50" fill="#fde68a" opacity="0.2" />
              <circle cx="334" cy="62" r={sky === "pagi" ? 26 : 22} fill="#fde68a" opacity="0.95" />
            </>
          )}
          <Cloud x={70} y={60} scale={1.1} opacity={0.2} drift="sky-drift-a" />
          <Cloud x={230} y={105} scale={0.8} opacity={0.16} drift="sky-drift-b" />
          <Cloud x={340} y={150} scale={0.9} opacity={0.14} drift="sky-drift-a" />
        </>
      )}
      <path d="M0 300 L0 252 Q70 214 150 246 T300 238 T400 222 L400 300 Z" fill="rgba(0,0,0,0.14)" />
      <path d="M0 300 L0 274 Q100 246 190 270 T400 258 L400 300 Z" fill="rgba(0,0,0,0.12)" />
    </svg>
  );
}
