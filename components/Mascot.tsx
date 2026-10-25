export type MascotMood = "happy" | "neutral" | "worried" | "cheer" | "full";

const FUR = "#a98f6e";
const FUR_D = "#8c7354";
const BELLY = "#d6c2a0";
const FACE = "#f2e8d3";
const MASK = "#4b392c";
const INK = "#2b1d14";
const CLAW = "#f1e9d6";
const BRANCH = "#7b5b3b";
const LEAF = "#4ade80";

// Placeholder mascot: a three-toed sloth, drawn so each state has its own
// silhouette (sitting, hanging, arms-up, hunched, lying on its back) rather
// than one pose with a swapped face. Swapping in final artwork only means
// replacing this file.

function Claws({ x, y, angle }: { x: number; y: number; angle: number }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${angle})`}>
      <path d="M-2.2 0 L-3.2 -4 M0 0 L0 -4.6 M2.2 0 L3.2 -4" fill="none" stroke={CLAW} strokeWidth="1.5" strokeLinecap="round" />
    </g>
  );
}

function Arm({ d, width = 6 }: { d: string; width?: number }) {
  return <path d={d} fill="none" stroke={FUR} strokeWidth={width} strokeLinecap="round" />;
}

function Branch({ y }: { y: number }) {
  return (
    <g>
      <rect x="4" y={y} width="72" height="6" rx="3" fill={BRANCH} />
      <ellipse cx="14" cy={y - 1} rx="5" ry="2.4" transform={`rotate(-20 14 ${y - 1})`} fill={LEAF} />
      <ellipse cx="66" cy={y - 1} rx="5" ry="2.4" transform={`rotate(20 66 ${y - 1})`} fill={LEAF} />
    </g>
  );
}

function Head({ mood, x, y, tilt = 0, scale = 1 }: { mood: MascotMood; x: number; y: number; tilt?: number; scale?: number }) {
  const closed = mood === "neutral" || mood === "full";
  const eyes = (side: -1 | 1) => {
    const cx = 7.5 * side;
    if (mood === "cheer") {
      return <path key={side} d={`M${cx - 3.6} 1.6 Q${cx} -2.6 ${cx + 3.6} 1.6`} fill="none" stroke={FACE} strokeWidth="2" strokeLinecap="round" />;
    }
    if (closed) {
      return <path key={side} d={`M${cx - 3.6} 0.2 Q${cx} 3.4 ${cx + 3.6} 0.2`} fill="none" stroke={FACE} strokeWidth="1.9" strokeLinecap="round" />;
    }
    const r = mood === "worried" ? 2.1 : 2.5;
    return (
      <g key={side}>
        <circle cx={cx} cy="0.6" r="3.3" fill="#fff8e7" />
        <circle cx={cx} cy="0.9" r={r} fill={INK} />
        <circle cx={cx + 0.9 * side * -1} cy="-0.1" r="0.8" fill="#fff" />
      </g>
    );
  };

  const mouth =
    mood === "cheer" ? (
      <path d="M-5.5 7.5 Q0 15 5.5 7.5 Z" fill="#7a2e2e" />
    ) : mood === "worried" ? (
      <path d="M-4 10.5 Q0 7 4 10.5" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
    ) : mood === "full" ? (
      <path d="M-6 8 Q0 14 6 8" fill="none" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />
    ) : mood === "neutral" ? (
      <path d="M-3.5 9 Q0 11 3.5 9" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
    ) : (
      <path d="M-5 8 Q0 13 5 8" fill="none" stroke={INK} strokeWidth="1.7" strokeLinecap="round" />
    );

  return (
    <g transform={`translate(${x} ${y}) rotate(${tilt}) scale(${scale})`}>
      <ellipse rx="19" ry="15.5" fill={FUR} />
      <ellipse cy="2" rx="15.5" ry="12" fill={FACE} />
      <ellipse cx="-7.5" cy="0.6" rx="5.6" ry="3.9" transform="rotate(-25 -7.5 0.6)" fill={MASK} />
      <ellipse cx="7.5" cy="0.6" rx="5.6" ry="3.9" transform="rotate(25 7.5 0.6)" fill={MASK} />
      <g className={mood === "happy" || mood === "worried" ? "mascot-blink" : undefined}>
        {eyes(-1)}
        {eyes(1)}
      </g>
      {mood === "worried" && (
        <g fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round">
          <path d="M-12 -6.5 L-4.5 -9" />
          <path d="M12 -6.5 L4.5 -9" />
        </g>
      )}
      <ellipse cy="5.4" rx="2.7" ry="1.9" fill={INK} />
      {mouth}
      {(mood === "happy" || mood === "cheer" || mood === "full") && (
        <g fill="#f4a9a0" opacity="0.55">
          <ellipse cx="-11.5" cy="7" rx="2.6" ry="1.7" />
          <ellipse cx="11.5" cy="7" rx="2.6" ry="1.7" />
        </g>
      )}
    </g>
  );
}

// Drifts down and fades; the outer <g> positions it, the inner path animates.
function FallingLeaf({ x, y, delay = 0 }: { x: number; y: number; delay?: number }) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <path className="mascot-leaf" style={{ animationDelay: `${delay}s` }} d="M0 0 Q3.5 -2.6 7 0 Q3.5 3 0 0 Z" fill={LEAF} />
    </g>
  );
}

function Heart({ x, y, delay = 0, s = 1 }: { x: number; y: number; delay?: number; s?: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <path
        className="mascot-float"
        style={{ animationDelay: `${delay}s` }}
        d="M0 2.4 C-4 -0.6 -2.6 -4 0 -2 C2.6 -4 4 -0.6 0 2.4 Z"
        fill="#f9a8b8"
      />
    </g>
  );
}

function Sparkle({ x, y, s = 1, delay = 0 }: { x: number; y: number; s?: number; delay?: number }) {
  return (
    <path
      className="mascot-twinkle"
      style={{ animationDelay: `${delay}s` }}
      transform={`translate(${x} ${y}) scale(${s})`}
      d="M0 -4 L1.2 -1.2 L4 0 L1.2 1.2 L0 4 L-1.2 1.2 L-4 0 L-1.2 -1.2 Z"
      fill="#fde68a"
    />
  );
}

export default function Mascot({ mood = "happy", className }: { mood?: MascotMood; className?: string }) {
  const label = { happy: "senang", neutral: "mengantuk", worried: "khawatir", cheer: "bersorak", full: "kenyang" }[mood];

  let pose: React.ReactNode;
  if (mood === "neutral") {
    // Hanging from a branch, swaying, asleep.
    pose = (
      <>
        <Branch y={5} />
        <g className="mascot-sway">
          <Arm d="M31 41 Q22 24 27 10" />
          <Arm d="M49 41 Q58 24 53 10" />
          <Claws x={27} y={9} angle={-8} />
          <Claws x={53} y={9} angle={8} />
          <ellipse cx="33" cy="66" rx="4" ry="6.5" fill={FUR_D} />
          <ellipse cx="47" cy="66" rx="4" ry="6.5" fill={FUR_D} />
          <Claws x={33} y={71} angle={180} />
          <Claws x={47} y={71} angle={180} />
          <g className="mascot-breathe">
            <ellipse cx="40" cy="53" rx="15" ry="13.5" fill={FUR} />
            <ellipse cx="40" cy="56" rx="9" ry="8" fill={BELLY} />
          </g>
          <Head mood={mood} x={40} y={35} />
          <text className="mascot-zzz" x="58" y="27" fontSize="6" fontWeight="700" fill="#ffffff">z</text>
          <text className="mascot-zzz" x="62" y="22" fontSize="8" fontWeight="700" fill="#ffffff" style={{ animationDelay: "1s" }}>z</text>
          <text className="mascot-zzz" x="67" y="16" fontSize="10" fontWeight="700" fill="#ffffff" style={{ animationDelay: "2s" }}>z</text>
        </g>
        <FallingLeaf x={12} y={10} delay={1.5} />
      </>
    );
  } else if (mood === "full") {
    // Lying on its back with a round belly, a leaf on top.
    pose = (
      <>
        <rect x="4" y="68" width="72" height="6" rx="3" fill={BRANCH} />
        <ellipse cx="44" cy="58" rx="27" ry="12.5" fill={FUR} />
        <g className="mascot-belly">
          <ellipse cx="46" cy="52" rx="19" ry="11" fill={BELLY} />
          <ellipse cx="52" cy="46" rx="6.5" ry="2.8" transform="rotate(-25 52 46)" fill={LEAF} />
        </g>
        <Arm d="M27 56 Q33 44 44 46" width={5.5} />
        <Arm d="M60 57 Q56 46 46 47" width={5.5} />
        <ellipse cx="68" cy="52" rx="4" ry="8" transform="rotate(-25 68 52)" fill={FUR_D} />
        <ellipse cx="73" cy="59" rx="3.6" ry="7" transform="rotate(-50 73 59)" fill={FUR_D} />
        <Head mood={mood} x={17} y={52} tilt={-14} scale={0.88} />
        <Heart x={36} y={34} s={1.1} />
        <Heart x={48} y={30} delay={1.2} s={0.8} />
        <Heart x={26} y={36} delay={2.3} s={0.7} />
      </>
    );
  } else if (mood === "cheer") {
    pose = (
      <>
        <Branch y={69} />
        <g className="mascot-bounce">
          <Arm d="M28 49 Q12 40 14 20" />
          <Arm d="M52 49 Q68 40 66 20" />
          <Claws x={14} y={18} angle={-6} />
          <Claws x={66} y={18} angle={6} />
          <ellipse cx="40" cy="57" rx="17" ry="14" fill={FUR} />
          <ellipse cx="40" cy="60" rx="10.5" ry="9" fill={BELLY} />
          <ellipse cx="30" cy="69" rx="5" ry="3" fill={FUR_D} />
          <ellipse cx="50" cy="69" rx="5" ry="3" fill={FUR_D} />
          <Head mood={mood} x={40} y={33} />
          <Sparkle x={6} y={34} s={1.1} />
          <Sparkle x={74} y={36} s={0.9} delay={0.4} />
          <Sparkle x={40} y={7} s={0.8} delay={0.8} />
        </g>
      </>
    );
  } else if (mood === "worried") {
    // Hunched, arms wrapped around its belly, head tilted.
    pose = (
      <>
        <Branch y={69} />
        <g className="mascot-breathe">
          <ellipse cx="40" cy="58" rx="18" ry="13.5" fill={FUR} />
          <ellipse cx="40" cy="61" rx="11" ry="8.5" fill={BELLY} />
          <ellipse cx="30" cy="69" rx="5" ry="3" fill={FUR_D} />
          <ellipse cx="50" cy="69" rx="5" ry="3" fill={FUR_D} />
          <Arm d="M25 50 Q34 64 49 58" />
          <Arm d="M55 50 Q46 64 31 58" />
          <Head mood={mood} x={40} y={36} tilt={-7} />
          <path className="mascot-drop" d="M57 25 Q60.5 31 57 34 Q53.5 31 57 25 Z" fill="#7dd3fc" />
        </g>
      </>
    );
  } else {
    // Sitting on a branch, waving.
    pose = (
      <>
        <Branch y={69} />
        <FallingLeaf x={10} y={4} delay={0.5} />
        <g className="mascot-breathe">
          <ellipse cx="40" cy="57" rx="17" ry="14" fill={FUR} />
          <ellipse cx="40" cy="60" rx="10.5" ry="9" fill={BELLY} />
          <ellipse cx="30" cy="69" rx="5" ry="3" fill={FUR_D} />
          <ellipse cx="50" cy="69" rx="5" ry="3" fill={FUR_D} />
          <Arm d="M26 50 Q17 57 21 64" />
          <Claws x={21} y={64} angle={170} />
          <Head mood={mood} x={40} y={33} />
          <g className="mascot-wave">
            <Arm d="M54 50 Q65 45 63 31" />
            <Claws x={63} y={30} angle={4} />
          </g>
        </g>
      </>
    );
  }

  return (
    <svg viewBox="0 0 80 80" className={className} role="img" aria-label={`Maskot sloth ${label}`}>
      {pose}
    </svg>
  );
}
