"use client";

import { useEffect, useState } from "react";
import Mascot from "@/components/Mascot";
import { LOADER_MOODS, pickLoaderMood, type LoaderMood } from "@/lib/loaderScene";

// Remembered across loading screens so the next one shows something else.
let lastMood: LoaderMood | null = null;

/**
 * What kukang is busy with during this wait. The first paint always shows the
 * same activity, so the server and the browser agree; the one for this wait is
 * chosen right after.
 */
export function useLoaderMood(): LoaderMood {
  const [mood, setMood] = useState<LoaderMood>(LOADER_MOODS[0]);
  useEffect(() => {
    const next = pickLoaderMood(lastMood);
    lastMood = next;
    setMood(next);
  }, []);
  return mood;
}

/** The waiting screen: kukang keeps busy in the middle of the space while data loads. */
export default function KukangLoader({ label = "Memuat...", size = "page" }: {
  label?: string;
  /** "page" fills the screen for a whole page; "section" fits inside a tab or card. */
  size?: "page" | "section";
}) {
  const mood = useLoaderMood();
  const page = size === "page";
  return (
    <div
      role="status"
      className={`kukang-loader flex flex-col items-center justify-center text-center ${page ? "min-h-[calc(100dvh-5rem)] gap-2 px-6 py-10" : "gap-1 px-6 pb-6 pt-10"}`}
    >
      <Mascot mood={mood} decorative className={page ? "w-64 max-w-[75vw]" : "w-44 max-w-[60vw]"} />
      <p className="text-sm text-neutral-500">{label}</p>
    </div>
  );
}
