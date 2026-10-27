"use client";

import { useEffect, useRef, useState } from "react";

export type MascotMood = "happy" | "neutral" | "worried" | "cheer" | "full" | "dance" | "thinking" | "protein" | "sugar" | "exercise" | "hustle" | "work";

const LABELS: Record<MascotMood, string> = {
  happy: "menyapa", neutral: "tidur bergelantungan", worried: "khawatir", cheer: "bersorak",
  full: "sedang beristirahat", dance: "bergoyang", thinking: "sedang berpikir",
  protein: "mengunyah paha ayam", sugar: "mengunyah dengan pipi penuh sambil memegang es krim",
  exercise: "olahraga ringan dengan dumbel", hustle: "melangkah membawa tas", work: "duduk mengetik di laptop",
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
  } else if ((mood === "protein" || mood === "sugar") && left) {
    d = "M0 0C-22 20-12 47 11 42";
    hand = [11, 42, -65];
  } else if (mood === "exercise") {
    d = left ? "M0 0C-30 17-55 7-46-24" : "M0 0C30 17 55 7 46-24";
    hand = left ? [-46, -24, -12] : [46, -24, 12];
  } else if (mood === "hustle") {
    d = left ? "M0 0C-22 22-39 10-48-6" : "M0 0C26 18 33 38 13 39";
    hand = left ? [-48, -6, 20] : [13, 39, 50];
  } else if (mood === "work") {
    d = left ? "M0 0C-16 22-20 33-7 39" : "M0 0C16 22 20 33 7 39";
    hand = left ? [-7, 39, 12] : [7, 39, -12];
  }
  return (
    <g transform={`translate(${left ? -36 : 36} 0)`}>
      <g className={`kukang-motion kukang-arm kukang-arm--${side}`}>
        <path d={d} className="kukang-arm-outline" />
        <path d={d} className="kukang-arm-fill" />
        {mood === "exercise" && <Dumbbell x={hand[0]} y={hand[1]} angle={hand[2]} />}
        <Hand x={hand[0]} y={hand[1]} angle={hand[2]} />
      </g>
    </g>
  );
}

function Dumbbell({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`} data-prop="dumbbell" stroke="var(--kukang-ink)" strokeWidth="2.8">
      <path d="M-22-4H22V4H-22Z" fill="#b9cbc0" />
      <rect x="-29" y="-14" width="13" height="28" rx="4" fill="#91b89c" />
      <rect x="16" y="-14" width="13" height="28" rx="4" fill="#91b89c" />
      <path d="M-25-8V7M20-8V7" stroke="#d7e9d8" strokeWidth="3" />
      <path d="M-33-7V7M33-7V7" stroke="#8a9d91" strokeWidth="5" />
    </g>
  );
}

function Satchel() {
  return (
    <g data-prop="satchel" stroke="var(--kukang-ink)" strokeWidth="3">
      <path d="M-29-28Q5 10 48 47" fill="none" strokeWidth="11" />
      <path d="M-29-28Q5 10 48 47" fill="none" stroke="#789185" strokeWidth="6" />
      <g className="kukang-motion kukang-satchel">
        <rect x="23" y="29" width="64" height="48" rx="11" fill="#709181" />
        <path d="M24 39Q53 56 86 39V34Q84 28 76 28H34Q26 29 24 34Z" fill="#9db6a2" />
        <path d="M31 68H76" fill="none" stroke="#486c5a" strokeWidth="2" />
        <rect x="49" y="41" width="13" height="14" rx="3" fill="#e9d3a3" />
        <path d="M54 45V50" fill="none" strokeWidth="2" />
      </g>
    </g>
  );
}

function Laptop() {
  return (
    <g data-prop="laptop" stroke="var(--kukang-ink)" strokeWidth="3">
      <path d="M-61 43H61Q68 43 69 51L76 104H-76L-69 51Q-68 43-61 43Z" fill="#9bb7ab" />
      <path d="M-59 49H59Q63 49 64 55L65 66Q8 56-63 61L-64 55Q-64 50-59 49Z" fill="#c4d7ca" stroke="none" />
      <path d="M-76 102L-89 109Q-90 114-80 115H80Q90 114 89 109L76 102Z" fill="#d0dfd4" />
      <path d="M-19 105H19L15 109H-15Z" fill="#819e90" stroke="none" />
      <path d="M-11 79C-13 64 8 62 13 65C16 78 7 91-7 87M-8 86L7 72" fill="#e7f0e7" strokeWidth="2.5" />
    </g>
  );
}

/** The prop and fingers share a joint, so a bite never leaves the food floating
 * away from its hand. All placement stays on non-animated wrapper groups. */
function FeedingArm({ mood }: { mood: "protein" | "sugar" }) {
  const protein = mood === "protein";
  return (
    <g transform="translate(36 0)">
      <g className="kukang-motion kukang-arm kukang-feeding-arm">
        <path d="M0 0C20 10 30 26 19 25" className="kukang-arm-outline" />
        <path d="M0 0C20 10 30 26 19 25" className="kukang-arm-fill" />
        <g transform={protein ? "translate(0 -9) rotate(-35)" : "translate(5 7) rotate(12)"} data-prop={protein ? "drumstick" : "ice-cream"}>
          {protein ? (
            <g stroke="var(--kukang-ink)" strokeWidth="2.8">
              <path d="M-5 1L-5 41C-18 38-17 55-7 54Q0 63 7 54C17 55 18 38 5 41L5 1Z" fill="var(--kukang-claw)" />
              <path d="M-9 6C-27 0-32-19-23-36C-18-47-8-51 0-47Q4-39 11-44C29-38 33-17 20-3C16 1 13 5 8 7Z" fill="#d78945" />
              <path d="M-20-32C-29-13-16-1-6 1L8 3C-1 9-15 3-22-5C-30-15-27-26-20-32Z" fill="#b96632" stroke="none" />
              <path d="M-16-31Q-11-40-5-39M9-32Q18-29 19-20" stroke="#ffd098" strokeWidth="4" fill="none" />
              <g stroke="#a9562c" strokeWidth="2.2"><path d="M-14-16L-9-14M2-25L6-22M5-9L8-7" /></g>
            </g>
          ) : (
            <g stroke="var(--kukang-ink)" strokeWidth="2.8">
              <path d="M-20-12L0 40L20-12Z" fill="#d5a163" />
              <path d="M-14 1L10 15M-9 15L4 23M14 1L-9 15M9 15L-4 23M-17-7L15 11M17-7L-15 11" fill="none" stroke="#a67240" strokeWidth="2" />
              <path d="M-25-23C-30-35-19-48-8-45C-1-51 13-46 15-36C27-35 31-24 24-15C20-10 14-12 9-13L-1-11C-11-8-21-11-25-23Z" fill="#f3b5be" />
              <path d="M-19-37C-25-48-14-60-3-57C8-65 24-53 20-43C29-35 21-25 12-27L6-24L-2-28C-11-23-21-27-19-37Z" fill="#fff0d5" />
              <path d="M-13-43Q-9-49-4-47M10-37Q16-35 18-39" fill="none" stroke="#fffaf0" strokeWidth="3.6" />
              <path d="M8-12V-4Q8 4 13 3Q17 2 16-4V-13" fill="#f3b5be" />
              <g stroke="#bf7188" strokeWidth="2.5"><path d="M-12-24L-9-26M9-22L12-20" /></g>
            </g>
          )}
        </g>
        <Hand x={protein ? 19 : 8} y={protein ? 21 : 23} angle={protein ? 55 : 70} />
      </g>
    </g>
  );
}

function Head({ mood }: { mood: MascotMood }) {
  const asleep = mood === "neutral" || mood === "full";
  const cheer = mood === "cheer";
  const eating = mood === "protein" || mood === "sugar";
  const stuffed = mood === "sugar";
  const mouth = cheer ? "M-16 21Q0 27 16 21C12 43-12 43-16 21Z"
    : mood === "worried" ? "M-10 29Q0 21 10 29"
      : mood === "neutral" ? "M-5 25C-6 34 6 34 5 25C4 20-4 20-5 25Z"
        : stuffed ? "M-7 26Q0 21 7 26Q0 31-7 26Z"
          : mood === "protein" ? "M-11 23Q0 29 12 22Q9 37-3 33Q-10 30-11 23Z"
            : mood === "thinking" ? "M-7 26Q0 29 7 26" : "M-13 23Q0 36 13 23";
  return (
    <g transform={mood === "full" ? "translate(-2 -57) rotate(66)" : mood === "worried" ? "translate(-2 -47) rotate(-8)" : mood === "neutral" ? "translate(0 -53) rotate(7)" : "translate(0 -53)"}>
      <g className="kukang-motion kukang-head">
        <path className="kukang-fur" d={stuffed ? "M-65-3C-72-34-50-63-23-64C-17-77-4-74 5-64C30-72 54-50 65-25C77-5 76 34 49 49C23 69-25 64-51 45C-74 32-76 9-65-3Z" : "M-65-3C-72-34-50-63-23-64C-17-77-4-74 5-64C30-72 54-50 65-25C77-5 62 33 38 47C9 63-27 58-49 39C-61 28-71 9-65-3Z"} />
        <path d="M-49-28C-42-47-31-51-20-52M10-55Q28-54 39-43" className="kukang-fur-highlight" />
        <path d={stuffed ? "M0-34C-29-59-58-33-53-2C-68 8-69 35-46 45Q-22 62 0 55Q24 61 47 44C69 35 69 9 53-3C58-34 30-58 0-34Z" : "M0-34C-29-59-58-33-53-2C-49 24-22 47 0 49C23 46 50 25 53-3C58-34 30-58 0-34Z"} fill="var(--kukang-face)" />
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
        {mood === "exercise" && <g data-prop="headband"><path d="M-49-29Q0-47 49-29" fill="none" stroke="var(--kukang-ink)" strokeWidth="12" /><path d="M-49-29Q0-47 49-29" fill="none" stroke="#9bc3a3" strokeWidth="7" /><path d="M-49-29L-61-19M-49-29L-58-6" fill="none" stroke="#9bc3a3" strokeWidth="7" /></g>}
        <g className={eating ? "kukang-motion kukang-cheeks" : undefined} fill="var(--kukang-blush)" opacity=".7"><ellipse cx={stuffed ? -45 : -41} cy={stuffed ? 21 : 16} rx={stuffed ? 11 : 9} ry={stuffed ? 7 : 5.5} /><ellipse cx={stuffed ? 45 : 41} cy={stuffed ? 21 : 16} rx={stuffed ? 11 : 9} ry={stuffed ? 7 : 5.5} /></g>
        <path d="M-8 6Q0 1 8 6Q7 14 0 14Q-7 14-8 6Z" fill="var(--kukang-ink)" />
        <g className={`kukang-motion ${eating ? "kukang-chew" : asleep ? "kukang-sleep-mouth" : ""}`}>
          <path d={mouth} fill={cheer || mood === "neutral" || eating ? "var(--kukang-mouth)" : "none"} stroke="var(--kukang-ink)" strokeWidth="3.2" />
          {mood === "protein" && <path d="M-6 26Q1 29 8 25" fill="none" stroke="var(--kukang-eye)" strokeWidth="3" />}
          {stuffed && <path d="M3 20Q6 16 10 20Q16 16 18 23Q12 26 10 23Q6 26 3 20Z" fill="#fff0d5" />}
        </g>
        {stuffed && <path d="M-49 32Q-44 37-38 34M38 34Q44 37 49 32" fill="none" stroke="var(--kukang-fur-shadow)" strokeWidth="2" />}
        {cheer && <path d="M-7 31Q0 26 7 31Q0 38-7 31Z" fill="var(--kukang-blush)" />}
        <path d="M-4-61Q2-70 9-65" fill="none" stroke="var(--kukang-fur-shadow)" strokeWidth="2.3" />
      </g>
    </g>
  );
}

function Foot({ left, hanging, walking = false, seated = false }: { left: boolean; hanging: boolean; walking?: boolean; seated?: boolean }) {
  const x = seated ? (left ? -72 : 72) : walking ? (left ? -35 : 33) : (left ? -28 : 28);
  const y = seated ? 95 : hanging ? 87 : walking ? (left ? 80 : 68) : 78;
  const angle = seated ? (left ? -18 : 18) : walking ? (left ? 18 : -23) : (left ? -7 : 7);
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
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
  const eating = mood === "protein" || mood === "sugar";
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
      <g transform={reclining ? "translate(151 195) rotate(-72)" : hanging ? "translate(160 179)" : mood === "hustle" ? "translate(160 174) rotate(9)" : mood === "work" ? "translate(160 155)" : "translate(160 174)"}>
        <g className="kukang-motion kukang-rig">
          <Foot left hanging={hanging} walking={mood === "hustle"} seated={mood === "work"} /><Foot left={false} hanging={hanging} walking={mood === "hustle"} seated={mood === "work"} />
          <g className="kukang-motion kukang-body">
            <path className="kukang-fur" d="M-39-17C-54 11-55 53-30 73C-13 87 14 85 33 70C54 49 48 13 37-13C18-37-18-38-39-17Z" />
            <path d="M-39-12C-46 16-45 49-25 69C-16 77-8 80 2 80C-23 82-41 65-46 46C-53 22-45-4-39-12Z" fill="var(--kukang-fur-shadow)" opacity=".65" />
            <g className="kukang-motion kukang-belly">
              <path d="M-27 16C-34 38-25 65 0 68C27 65 32 37 24 16C13-1-15-2-27 16Z" fill="var(--kukang-belly)" />
              <path d="M-8 50Q0 56 8 50" fill="none" stroke="var(--kukang-fur-shadow)" strokeWidth="2" opacity=".65" />
            </g>
          </g>
          {mood === "hustle" && <Satchel />}
          <Arm side="left" mood={mood} />{!eating && <Arm side="right" mood={mood} />}
          <Head mood={mood} />
          {eating && <FeedingArm mood={mood} />}
          {mood === "work" && <Laptop />}
        </g>
      </g>
      {hanging && [0, 1, 2].map(i => <g key={i} transform={`translate(${232 + i * 17} ${153 - i * 29}) scale(${.7 + i * .2})`}><path className="kukang-motion kukang-zzz" style={{ animationDelay: `${i * -.9}s` }} d="M-7-7H7L-7 7H7" fill="none" stroke="var(--kukang-note)" strokeWidth="3" /></g>)}
      {mood === "protein" && [0, 1].map(i => <g key={i} transform={`translate(${175 + i * 9} ${153 + i * 3})`}><path className="kukang-motion kukang-crumb" style={{ animationDelay: `${i * -.8}s` }} d="M-2-2L2-1L1 2L-2 1Z" fill="#d78945" /></g>)}
      {mood === "hustle" && <g transform="translate(58 193)"><path className="kukang-motion kukang-speed" d="M0-15H-17M-2 0H-27M-1 15H-18" fill="none" stroke="var(--kukang-note)" strokeWidth="3" /></g>}
      {reclining && [0, 1, 2].map(i => <g key={i} transform={`translate(${215 + i * 23} ${139 - i * 12}) scale(${.55 + i * .06})`}><path className="kukang-motion kukang-heart" style={{ animationDelay: `${i * .9}s` }} d="M0 3C-20-9-8-21 0-11C8-21 20-9 0 3Z" fill="var(--kukang-blush)" /></g>)}
      {mood === "cheer" && [0, 1, 2].map(i => <g key={i} transform={`translate(${[56, 265, 233][i]} ${[167, 132, 61][i]})`}><path className="kukang-motion kukang-spark" style={{ animationDelay: `${i * .4}s` }} d="M0-10L3-3L10 0L3 3L0 10L-3 3L-10 0L-3-3Z" fill="var(--kukang-spark)" /></g>)}
      {mood === "worried" && <g transform="translate(225 122) rotate(-12) scale(.55)"><path className="kukang-motion kukang-drop" d="M0-11C-15 7-5 17 0 17C7 17 14 7 0-11Z" fill="var(--kukang-sweat)" /></g>}
      {mood === "dance" && [0, 1].map(i => <g key={i} transform={`translate(${i ? 267 : 49} ${i ? 139 : 109}) scale(.8)`}><g className="kukang-motion kukang-note" style={{ animationDelay: `${i * .35}s` }} fill="var(--kukang-note)"><path d="M0 0V-22L15-25V-5H11V-19L4-17V0Z" /><ellipse cx="-1" cy="1" rx="6" ry="4" /><ellipse cx="10" cy="-5" rx="6" ry="4" /></g></g>)}
    </svg>
  );
}
