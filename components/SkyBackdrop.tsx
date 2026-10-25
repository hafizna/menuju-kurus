"use client";

import { useEffect, useState } from "react";
import { skyForHour, SKY_GRADIENT, type SkyId } from "@/lib/skyTheme";

export type SkyVariant = "sky" | "canopy";

export function useSkyAfterMount(): SkyId {
  const [sky, setSky] = useState<SkyId>("siang");
  useEffect(() => {
    const update = () => setSky(skyForHour(new Date().getHours()));
    update();
    // A long-open daily journal follows the light without a reload.
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, []);
  return sky;
}

/** The original one-argument API keeps light text readable on login/PIN pages.
 * The canopy variant is a quieter cream surface with --slothly-ink text. */
export function skyBackground(sky: SkyId, variant: SkyVariant = "sky"): string {
  return variant === "canopy" ? `var(--canopy-${sky})` : SKY_GRADIENT[sky];
}

function Leaf({ x, y, rotate, scale = 1 }: { x: number; y: number; rotate: number; scale?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rotate}) scale(${scale})`}>
      <path d="M0 0C-18-8-34-4-40 8C-23 19-6 13 0 0Z" fill="currentColor" />
      <path d="M-34 8Q-17 7-3 1" fill="none" stroke="var(--canopy-vein)" strokeWidth="1.4" opacity=".5" />
    </g>
  );
}

/** Original botanical scene: a branch, rounded leaves and time-of-day light.
 * It is intentionally decorative, so nutrition and the action stay in front. */
export default function SkyBackdrop({ sky, variant = "sky", className = "" }: { sky: SkyId; variant?: SkyVariant; className?: string }) {
  const night = sky === "malam";
  const canopy = variant === "canopy";
  return (
    <svg className={`slothly-backdrop ${canopy ? "slothly-backdrop--canopy" : "slothly-backdrop--sky"} ${className}`} viewBox="0 0 800 360" preserveAspectRatio="xMaxYMin slice" aria-hidden="true" focusable="false">
      <g opacity={canopy ? .48 : .24}>
        <circle cx="708" cy="80" r="67" fill="var(--canopy-glow)" opacity=".22" />
        {night ? <><circle cx="711" cy="75" r="26" fill="var(--canopy-light)" /><circle cx="723" cy="65" r="24" fill={canopy ? "var(--canopy-moon-cutout)" : "#272352"} /></> : <circle cx="711" cy="75" r={sky === "sore" ? 29 : 24} fill="var(--canopy-light)" />}
        {night && <g fill="var(--canopy-light)"><circle cx="580" cy="52" r="2" /><circle cx="640" cy="109" r="1.7" /><circle cx="762" cy="133" r="2" /><circle cx="514" cy="94" r="1.5" /></g>}
      </g>
      <g className="canopy-leaves" color="var(--canopy-leaf)" opacity={canopy ? .62 : .28}>
        <path d="M503-13C602 21 704 37 814 12" fill="none" stroke="var(--canopy-branch)" strokeWidth="6" strokeLinecap="round" />
        <Leaf x={574} y={8} rotate={-27} scale={1.1} /><Leaf x={621} y={18} rotate={-76} scale={1.2} />
        <Leaf x={672} y={27} rotate={-28} scale={1.1} /><Leaf x={728} y={25} rotate={-91} scale={1.25} />
        <Leaf x={784} y={17} rotate={-22} scale={1.1} /><Leaf x={517} y={-4} rotate={-88} scale={.8} />
      </g>
      <g opacity={canopy ? .11 : .12} fill="var(--canopy-leaf)">
        <path d="M0 360V322Q130 282 258 324T515 311T800 316V360Z" />
        <path d="M0 360V343Q205 313 352 342T800 333V360Z" />
      </g>
      {!canopy && <g fill="var(--canopy-light)" opacity=".08"><path d="M31 91C16 90 11 76 21 68C22 52 48 49 55 65C74 59 86 75 77 87Z" /><path d="M293 137C273 137 270 123 280 115C284 100 303 99 312 112C332 106 342 123 332 134Z" /></g>}
    </svg>
  );
}
