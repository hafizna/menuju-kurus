import type { MascotMood } from "../components/Mascot";

/** What the kukang may be busy with while a page loads. */
export const LOADER_MOODS = ["juggle", "header", "hustle"] as const satisfies readonly MascotMood[];
export type LoaderMood = (typeof LOADER_MOODS)[number];

/**
 * Picks the activity for one loading screen: any of them except the one shown
 * last, so two loads in a row never look the same. `random` is injectable so the
 * choice can be tested.
 */
export function pickLoaderMood(previous: LoaderMood | null, random: () => number = Math.random): LoaderMood {
  const others = LOADER_MOODS.filter((mood) => mood !== previous);
  const index = Math.floor(random() * others.length);
  return others[Math.min(others.length - 1, Math.max(0, Number.isFinite(index) ? index : 0))];
}
