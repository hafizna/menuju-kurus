export type MascotMood = "happy" | "neutral" | "worried" | "cheer";

// Placeholder character ("Tunas", a rice-ball with a sprout). Everything is
// drawn here so swapping in final artwork only means replacing this file.
export default function Mascot({
  mood = "happy",
  className,
}: {
  mood?: MascotMood;
  className?: string;
}) {
  const eyes =
    mood === "cheer" ? (
      <g fill="none" stroke="#3b2a1a" strokeWidth="2.4" strokeLinecap="round">
        <path d="M20.5 35 Q24 31 27.5 35" />
        <path d="M36.5 35 Q40 31 43.5 35" />
      </g>
    ) : (
      <g fill="#3b2a1a">
        <circle cx="24" cy="34" r={mood === "worried" ? 2.2 : 2.6} />
        <circle cx="40" cy="34" r={mood === "worried" ? 2.2 : 2.6} />
      </g>
    );

  const mouth =
    mood === "cheer" ? (
      <path d="M24 41 Q32 52 40 41 Z" fill="#7a2e2e" />
    ) : mood === "worried" ? (
      <path d="M25 47 Q32 41 39 47" fill="none" stroke="#3b2a1a" strokeWidth="2.2" strokeLinecap="round" />
    ) : mood === "neutral" ? (
      <path d="M27 44 H37" fill="none" stroke="#3b2a1a" strokeWidth="2.2" strokeLinecap="round" />
    ) : (
      <path d="M25 42 Q32 49 39 42" fill="none" stroke="#3b2a1a" strokeWidth="2.2" strokeLinecap="round" />
    );

  const label = { happy: "senang", neutral: "santai", worried: "khawatir", cheer: "bersorak" }[mood];

  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label={`Maskot ${label}`}>
      <ellipse cx="32" cy="58" rx="16" ry="3" fill="rgba(0,0,0,0.12)" />
      <path d="M32 14 C48 14 56 30 54 44 C53 53 44 57 32 57 C20 57 11 53 10 44 C8 30 16 14 32 14 Z" fill="#fdf0d8" />
      <path d="M32 14 Q32 9 33 6" fill="none" stroke="#2f855a" strokeWidth="2.2" strokeLinecap="round" />
      <ellipse cx="38" cy="6.5" rx="6" ry="3.2" transform="rotate(-25 38 6.5)" fill="#34d399" />
      <ellipse cx="27" cy="9" rx="5" ry="2.8" transform="rotate(25 27 9)" fill="#10b981" />
      <circle cx="17" cy="42" r="3.4" fill="#f9b8a8" opacity="0.7" />
      <circle cx="47" cy="42" r="3.4" fill="#f9b8a8" opacity="0.7" />
      {eyes}
      {mouth}
      {mood === "worried" && <path d="M49 24 Q52 29 49 32 Q46 29 49 24 Z" fill="#7dd3fc" />}
    </svg>
  );
}
