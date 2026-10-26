type JournalScene = "meal" | "progress" | "profile";

function JournalIllustration({ scene }: { scene: JournalScene }) {
  return (
    <svg className="journal-header-art" viewBox="0 0 112 112" fill="none" aria-hidden="true" focusable="false">
      <circle className="journal-art-halo" cx="57" cy="57" r="47" />
      <path className="journal-art-ground" d="M15 94c24-7 57-7 84 0" />
      {scene === "meal" && <>
        <path className="journal-art-line" d="M28 29c-2-6 1-10 4-14m9 18c-2-7 1-10 4-14" />
        <path className="journal-art-solid" d="M20 56h67c-2 21-13 33-34 33S23 76 20 56Z" />
        <path className="journal-art-paper" d="M27 61h53c-4 11-12 18-27 18S31 72 27 61Z" />
        <path className="journal-art-line" d="M18 54h71M40 90h27M77 52l13-27" />
        <path className="journal-art-leaf" d="M45 51c-3-14 2-24 16-27 3 15-3 24-16 27Z" />
        <path className="journal-art-line" d="m44 52 12-21" />
        <circle className="journal-art-dot" cx="32" cy="48" r="5" />
        <circle className="journal-art-dot" cx="69" cy="48" r="4" />
      </>}
      {scene === "progress" && <>
        <path className="journal-art-paper" d="M27 91c-27-18 39-18 29-36-8-15-26-10-20-26h14c-10 16 18 16 19 30 2 20-53 19-27 32Z" />
        <path className="journal-art-line" d="M36 91c-24-14 40-19 26-35-12-14-26-13-20-27" strokeDasharray="3 6" />
        <path className="journal-art-solid" d="M78 65h7v22h-7Zm12-15h7v37h-7Z" />
        <path className="journal-art-line" d="M74 88h27M43 27V14" />
        <path className="journal-art-leaf" d="M43 22c-9 0-13-4-12-11 8 0 12 4 12 11Zm1-5c0-8 5-12 12-11 0 8-4 12-12 11Z" />
        <circle className="journal-art-dot" cx="27" cy="69" r="4" />
        <circle className="journal-art-dot" cx="62" cy="49" r="3" />
      </>}
      {scene === "profile" && <>
        <path className="journal-art-solid" d="M23 28h62a5 5 0 0 1 5 5v53a5 5 0 0 1-5 5H23a6 6 0 0 1-6-6V34a6 6 0 0 1 6-6Z" />
        <path className="journal-art-paper" d="M28 34h55v50H28Z" />
        <path className="journal-art-line" d="M27 30v59M35 72h18m-18 7h27M56 64V44" />
        <path className="journal-art-leaf" d="M56 57c-12 0-17-6-16-15 10 0 16 5 16 15Zm1-8c0-11 6-17 17-16 0 10-6 16-17 16Z" />
        <path className="journal-art-line" d="m90 23 5-6m-8 2v-7m7 15 7-1" />
        <circle className="journal-art-dot" cx="23" cy="84" r="2" />
      </>}
    </svg>
  );
}

export default function JournalHeader({ scene, kicker, title, description }: {
  scene: JournalScene;
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <header className={`journal-header journal-header--${scene}`}>
      <div className="journal-header-copy">
        <p className="journal-header-kicker">{kicker}</p>
        <h1>{title}</h1>
        <p className="journal-header-description">{description}</p>
      </div>
      <JournalIllustration scene={scene} />
    </header>
  );
}
