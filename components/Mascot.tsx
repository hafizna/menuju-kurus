"use client";

import { useEffect, useRef, useState } from "react";

export type MascotMood = "happy" | "neutral" | "worried" | "cheer" | "full" | "dance" | "thinking";

const LABELS: Record<MascotMood, string> = {
  happy: "menyapa", neutral: "mengantuk", worried: "khawatir", cheer: "bersorak",
  full: "beristirahat setelah makan", dance: "bergoyang", thinking: "sedang berpikir",
};

function Hand({ x, y, angle = 0 }: { x: number; y: number; angle?: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <ellipse className="kukang-fur" rx="13" ry="12.5" />
      <path className="kukang-claws" d="M-8 5Q-9 11-7 13M0 7Q0 13 2 14M8 5Q9 11 11 12" />
    </g>
  );
}

function Arm({ side, mood }: { side: "left" | "right"; mood: MascotMood }) {
  const left = side === "left";
  let d = left ? "M0 0C-27 10-33 28-39 40" : "M0 0C25-5 40-35 44-62";
  let hand = left ? [-39, 40, 12] : [44, -62, 185];
  if (mood === "neutral") {
    d = left ? "M0 0C-45-24-38-90-22-135" : "M0 0C45-24 38-90 22-135";
    hand = left ? [-22, -135, 185] : [22, -135, 175];
  } else if (mood === "cheer" || mood === "dance") {
    d = left ? "M0 0C-23-10-41-38-48-67" : "M0 0C23-10 41-38 48-67";
    hand = left ? [-48, -67, 175] : [48, -67, 185];
  } else if (mood === "worried") {
    d = left ? "M0 0C-16 34 20 45 51 38" : "M0 0C12 26-15 43-47 41";
    hand = left ? [51, 38, -70] : [-47, 41, 73];
  } else if (mood === "full") {
    d = left ? "M0 0C-9 27 7 43 25 39" : "M0 0C8 29-12 35-27 25";
    hand = left ? [25, 39, -100] : [-27, 25, 75];
  } else if (mood === "thinking" && !left) {
    d = "M0 0C27 12 29-15 8-30";
    hand = [8, -30, 120];
  }
  return (
    <g transform={`translate(${left ? -36 : 36} 0)`}>
      <g className={`kukang-motion kukang-arm kukang-arm--${side}`}>
        <path d={d} className="kukang-arm-outline" />
        <path d={d} className="kukang-arm-fill" />
        <Hand x={hand[0]} y={hand[1]} angle={hand[2]} />
      </g>
    </g>
  );
}

function Head({ mood }: { mood: MascotMood }) {
  const asleep = mood === "neutral" || mood === "full";
  const cheer = mood === "cheer";
  const mouth = cheer ? "M-16 21Q0 27 16 21C12 43-12 43-16 21Z"
    : mood === "worried" ? "M-10 29Q0 21 10 29"
      : mood === "neutral" ? "M-5 25C-6 34 6 34 5 25C4 20-4 20-5 25Z"
        : mood === "thinking" ? "M-7 26Q0 29 7 26" : "M-13 23Q0 36 13 23";
  return (
    <g transform={mood === "full" ? "translate(-2 -57) rotate(66)" : mood === "worried" ? "translate(-2 -47) rotate(-8)" : "translate(0 -53)"}>
      <g className="kukang-motion kukang-head">
        <path className="kukang-fur" d="M-65-3C-72-34-50-63-23-64C-17-77-4-74 5-64C30-72 54-50 65-25C77-5 62 33 38 47C9 63-27 58-49 39C-61 28-71 9-65-3Z" />
        <path d="M-49-28C-42-47-31-51-20-52M10-55Q28-54 39-43" className="kukang-fur-highlight" />
        <path d="M0-34C-29-59-58-33-53-2C-49 24-22 47 0 49C23 46 50 25 53-3C58-34 30-58 0-34Z" fill="var(--kukang-face)" />
        <ellipse cx="-25" cy="-6" rx="22" ry="17" transform="rotate(27 -25 -6)" fill="var(--kukang-mask)" />
        <ellipse cx="25" cy="-6" rx="22" ry="17" transform="rotate(-27 25 -6)" fill="var(--kukang-mask)" />
        {asleep || cheer ? (
          <g fill="none" stroke="var(--kukang-face)" strokeWidth="3.5">
            <path d={cheer ? "M-34-4Q-25-15-16-4M16-4Q25-15 34-4" : "M-34-7Q-25 1-16-7M16-7Q25 1 34-7"} />
          </g>
        ) : (
          <g transform="translate(0 -7)">
            <g className="kukang-motion kukang-blink">
              <ellipse cx="-25" rx="11.5" ry="13" fill="var(--kukang-eye)" />
              <ellipse cx="25" rx="11.5" ry="13" fill="var(--kukang-eye)" />
              <g className="kukang-motion kukang-gaze">
                <ellipse cx="-24" cy="1.5" rx="8.2" ry="10.3" fill="var(--kukang-ink)" />
                <ellipse cx="24" cy="1.5" rx="8.2" ry="10.3" fill="var(--kukang-ink)" />
                <ellipse cx="-26.5" cy="-2" rx="3" ry="3.8" fill="var(--kukang-eye)" />
                <ellipse cx="21.5" cy="-2" rx="3" ry="3.8" fill="var(--kukang-eye)" />
                <circle cx="-20" cy="6" r="1.5" fill="var(--kukang-eye)" />
                <circle cx="28" cy="6" r="1.5" fill="var(--kukang-eye)" />
              </g>
            </g>
          </g>
        )}
        {!asleep && (
          <path className="kukang-face-line" strokeWidth="3" d={mood === "worried" ? "M-39-26Q-26-23-13-33M13-33Q26-23 39-26" : "M-37-29Q-25-34-14-28M14-28Q25-34 37-29"} />
        )}
        <g fill="var(--kukang-blush)" opacity=".7"><ellipse cx="-41" cy="16" rx="9" ry="5.5" /><ellipse cx="41" cy="16" rx="9" ry="5.5" /></g>
        <path d="M-8 6Q0 1 8 6Q7 14 0 14Q-7 14-8 6Z" fill="var(--kukang-ink)" />
        <path d={mouth} fill={cheer || mood === "neutral" ? "var(--kukang-mouth)" : "none"} stroke="var(--kukang-ink)" strokeWidth="3.2" />
        {cheer && <path d="M-7 31Q0 26 7 31Q0 38-7 31Z" fill="var(--kukang-blush)" />}
        <path d="M-4-61Q2-70 9-65" fill="none" stroke="var(--kukang-fur-shadow)" strokeWidth="2.3" />
      </g>
    </g>
  );
}

function Foot({ left, hanging }: { left: boolean; hanging: boolean }) {
  return (
    <g transform={`translate(${left ? -28 : 28} ${hanging ? 87 : 78}) rotate(${left ? -7 : 7})`}>
      <g className={`kukang-motion kukang-foot kukang-foot--${left ? "left" : "right"}`}>
        <ellipse className="kukang-fur" rx="19" ry="12" />
        <path className="kukang-claws" d="M-9 5L-9 10M-1 6L-1 11M7 5L7 10" />
      </g>
    </g>
  );
}

/** An original SVG rig. Only visible mascots run CSS motion; reduced-motion and
 * the user's display preference pause the same independent body/face/arm layers. */
export default function Mascot({ mood = "happy", className = "", animated = true, decorative = false }: {
  mood?: MascotMood; className?: string; animated?: boolean; decorative?: boolean;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!animated || !ref.current) { setPlaying(false); return; }
    let visible = false;
    const update = () => setPlaying(visible && !document.hidden);
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting; update();
    }, { rootMargin: "40px" });
    if (observer) observer.observe(ref.current);
    else { visible = true; update(); }
    document.addEventListener("visibilitychange", update);
    return () => { observer?.disconnect(); document.removeEventListener("visibilitychange", update); };
  }, [animated]);

  const hanging = mood === "neutral";
  const reclining = mood === "full";
  return (
    <svg ref={ref} viewBox="0 0 320 300" className={`kukang ${className}`} data-mood={mood} data-playing={playing} role={decorative ? undefined : "img"} aria-label={decorative ? undefined : `Kukang Slothly ${LABELS[mood]}`} aria-hidden={decorative || undefined} focusable="false">
      <ellipse cx="160" cy="269" rx={reclining ? 80 : 55} ry="8" fill="var(--kukang-shadow)" opacity=".12" />
      {(hanging || mood === "happy") && (
        <g transform={`translate(0 ${hanging ? 43 : 263})`}>
          <path d="M49 0Q158 5 271-1" fill="none" stroke="var(--kukang-ink)" strokeWidth="13" strokeLinecap="round" />
          <path d="M49 0Q158 5 271-1" fill="none" stroke="var(--kukang-branch)" strokeWidth="8" strokeLinecap="round" />
          <path d="M65-1Q50-23 33-17Q36 2 65-1ZM252 0Q268-23 285-18Q282 1 252 0Z" fill="var(--kukang-leaf)" />
        </g>
      )}
      <g transform={reclining ? "translate(151 195) rotate(-72)" : hanging ? "translate(160 179)" : "translate(160 174)"}>
        <g className="kukang-motion kukang-rig">
          <Foot left hanging={hanging} /><Foot left={false} hanging={hanging} />
          <g className="kukang-motion kukang-body">
            <path className="kukang-fur" d="M-39-17C-54 11-55 53-30 73C-13 87 14 85 33 70C54 49 48 13 37-13C18-37-18-38-39-17Z" />
            <path d="M-39-12C-46 16-45 49-25 69C-16 77-8 80 2 80C-23 82-41 65-46 46C-53 22-45-4-39-12Z" fill="var(--kukang-fur-shadow)" opacity=".65" />
            <g className="kukang-motion kukang-belly">
              <path d="M-27 16C-34 38-25 65 0 68C27 65 32 37 24 16C13-1-15-2-27 16Z" fill="var(--kukang-belly)" />
              <path d="M-8 50Q0 56 8 50" fill="none" stroke="var(--kukang-fur-shadow)" strokeWidth="2" opacity=".65" />
            </g>
          </g>
          <Arm side="left" mood={mood} /><Arm side="right" mood={mood} />
          <Head mood={mood} />
        </g>
      </g>
      {hanging && [0, 1, 2].map(i => <g key={i} transform={`translate(${236 + i * 12} ${141 - i * 23}) scale(${.55 + i * .18})`}><path className="kukang-motion kukang-zzz" style={{ animationDelay: `${i * .8}s` }} d="M-5-5H5L-5 5H5" fill="none" stroke="var(--kukang-note)" strokeWidth="3" /></g>)}
      {reclining && [0, 1, 2].map(i => <g key={i} transform={`translate(${215 + i * 23} ${139 - i * 12}) scale(${.55 + i * .06})`}><path className="kukang-motion kukang-heart" style={{ animationDelay: `${i * .9}s` }} d="M0 3C-20-9-8-21 0-11C8-21 20-9 0 3Z" fill="var(--kukang-blush)" /></g>)}
      {mood === "cheer" && [0, 1, 2].map(i => <g key={i} transform={`translate(${[56, 265, 233][i]} ${[167, 132, 61][i]})`}><path className="kukang-motion kukang-spark" style={{ animationDelay: `${i * .4}s` }} d="M0-10L3-3L10 0L3 3L0 10L-3 3L-10 0L-3-3Z" fill="var(--kukang-spark)" /></g>)}
      {mood === "worried" && <g transform="translate(225 122) rotate(-12) scale(.55)"><path className="kukang-motion kukang-drop" d="M0-11C-15 7-5 17 0 17C7 17 14 7 0-11Z" fill="var(--kukang-sweat)" /></g>}
      {mood === "dance" && [0, 1].map(i => <g key={i} transform={`translate(${i ? 267 : 49} ${i ? 139 : 109}) scale(.8)`}><g className="kukang-motion kukang-note" style={{ animationDelay: `${i * .35}s` }} fill="var(--kukang-note)"><path d="M0 0V-22L15-25V-5H11V-19L4-17V0Z" /><ellipse cx="-1" cy="1" rx="6" ry="4" /><ellipse cx="10" cy="-5" rx="6" ry="4" /></g></g>)}
    </svg>
  );
}
