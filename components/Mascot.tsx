export type MascotMood = "happy" | "neutral" | "worried" | "cheer";

const PATCH = "#6b4630";
const INK = "#3a2418";

// Placeholder mascot: a slow loris (kukang) — "pelan tapi pasti". Everything
// is drawn here, so swapping in final artwork only means replacing this file.
// neutral = sleepy, the loris' resting face.
export default function Mascot({
  mood = "happy",
  className,
}: {
  mood?: MascotMood;
  className?: string;
}) {
  const eye = (cx: number) => {
    if (mood === "cheer") {
      return (
        <path
          d={`M${cx - 4} 34.5 Q${cx} 29.5 ${cx + 4} 34.5`}
          fill="none"
          stroke="#fdf0d8"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      );
    }
    const hx = cx + (cx < 32 ? 1.8 : -1.2);
    return (
      <g>
        <circle cx={cx} cy="33.5" r="4.8" fill="#1d120c" />
        <circle cx={hx} cy="31.6" r="1.5" fill="#fff" />
        <circle cx={cx + (cx < 32 ? -1.2 : 1.2)} cy="35.6" r="0.7" fill="#fff" opacity="0.8" />
        {mood === "neutral" && (
          <path d={`M${cx - 5.2} 33.6 A5.2 5.2 0 0 1 ${cx + 5.2} 33.6 Z`} fill={PATCH} />
        )}
      </g>
    );
  };

  const mouth =
    mood === "cheer" ? (
      <path d="M27 43 Q32 52 37 43 Z" fill="#7a2e2e" />
    ) : mood === "worried" ? (
      <path d="M27.5 46 Q32 42 36.5 46" fill="none" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />
    ) : mood === "neutral" ? (
      <path d="M29 44 H35" fill="none" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />
    ) : (
      <path d="M27 43.5 Q32 48 37 43.5" fill="none" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />
    );

  const label = { happy: "senang", neutral: "mengantuk", worried: "khawatir", cheer: "bersorak" }[mood];

  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={`Maskot kukang ${label}`}>
      <ellipse cx="32" cy="60" rx="16" ry="2.6" fill="rgba(0,0,0,0.14)" />
      <g className={mood === "cheer" ? "mascot-bounce" : undefined}>
      <g className={`mascot-breathe${mood === "neutral" ? " mascot-slow" : ""}`}>
      <ellipse cx="32" cy="52" rx="17" ry="9.5" fill="#c9a479" />
      <ellipse cx="19" cy="55" rx="5" ry="3.4" fill="#b88e63" />
      <ellipse cx="45" cy="55" rx="5" ry="3.4" fill="#b88e63" />
      <g className="mascot-ear mascot-ear-l">
        <circle cx="14" cy="21" r="5.2" fill="#c9a479" />
        <circle cx="14" cy="21" r="2.6" fill="#8a6444" />
      </g>
      <g className="mascot-ear mascot-ear-r">
        <circle cx="50" cy="21" r="5.2" fill="#c9a479" />
        <circle cx="50" cy="21" r="2.6" fill="#8a6444" />
      </g>
      <ellipse cx="32" cy="32" rx="21" ry="19" fill="#dcbb8d" />
      <rect x="30.2" y="13.5" width="3.6" height="14" rx="1.8" fill="#7a5538" />
      <ellipse cx="32" cy="42" rx="9.5" ry="6.5" fill="#f3e2c4" />
      <ellipse cx="22.5" cy="33" rx="7.2" ry="8.6" transform="rotate(-12 22.5 33)" fill={PATCH} />
      <ellipse cx="41.5" cy="33" rx="7.2" ry="8.6" transform="rotate(12 41.5 33)" fill={PATCH} />
      <g className={mood === "happy" || mood === "worried" ? "mascot-blink" : undefined}>
        {eye(22.5)}
        {eye(41.5)}
      </g>
      {mood === "worried" && (
        <g fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round">
          <path d="M16.5 25.5 L26 22.5" />
          <path d="M47.5 25.5 L38 22.5" />
        </g>
      )}
      <ellipse cx="32" cy="39.6" rx="2.7" ry="1.9" fill={INK} />
      {mouth}
      {mood === "worried" && <path className="mascot-drop" d="M53 29 Q56 34 53 37 Q50 34 53 29 Z" fill="#7dd3fc" />}
      </g>
      {mood === "neutral" && (
        <text className="mascot-zzz" x="50" y="12" fontSize="9" fontWeight="700" fill="#ffffff">
          z
        </text>
      )}
      </g>
    </svg>
  );
}
