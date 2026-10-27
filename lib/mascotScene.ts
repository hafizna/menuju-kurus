import type { MascotMood } from "../components/Mascot";
import { SUGAR_REFERENCE_G, type DaySugar } from "./sugar";

export interface MascotSceneInput {
  /** The viewer's local hour, not the server's clock. */
  localHour: number;
  mealCount: number;
  caloriesIn: number;
  calorieTarget: number;
  proteinToday: number;
  proteinTarget: number;
  sugar: DaySugar;
  foodLogComplete: boolean;
}

export interface MascotScene {
  mood: MascotMood;
  badge: string;
  caption: string;
}

const positive = (value: number) => Number.isFinite(value) && value > 0;

const happyScene = (): MascotScene => ({
  mood: "happy",
  badge: "Pelan-pelan, tetap jalan",
  caption: "Catat sesuai ritmemu. Kukang menemani.",
});

const thinkingScene = (): MascotScene => ({
  mood: "thinking",
  badge: "Kukang lagi cari ide",
  caption: "Kukang berpikir sebentar. Kadang jeda kecil membantu menemukan ide berikutnya.",
});

const restScene = (night = false): MascotScene => ({
  mood: "full",
  badge: night ? "Kukang rebahan malam" : "Kukang rehat sebentar",
  caption: night
    ? "Kukang sudah nyaman rebahan. Kamu juga boleh beristirahat."
    : "Kukang merebahkan diri sejenak. Ada ruang untuk jeda di tengah hari.",
});

const danceScene = (): MascotScene => ({
  mood: "dance",
  badge: "Kukang ikut bergoyang",
  caption: "Kukang menyelipkan sedikit goyangan di sela harinya.",
});

function routineScenes(localHour: number): MascotScene[] {
  if (localHour >= 5 && localHour < 7) {
    return [{
      mood: "exercise",
      badge: "Kukang pemanasan pagi",
      caption: "Kukang mulai pagi dengan gerak ringan. Kamu bisa mencatat sesuai ritmemu.",
    }, happyScene(), danceScene()];
  }
  if (localHour >= 7 && localHour < 9) {
    return [{
      mood: "hustle",
      badge: "Kukang bergegas pagi",
      caption: "Pagi lagi sibuk? Kalau sudah sarapan atau ngopi, catat sebentar ya.",
    }, happyScene(), thinkingScene()];
  }
  if (localHour >= 9 && localHour < 17) {
    // The mascot acts as a partner at the desk: a gentle reminder worded as
    // "if", so it never assumes the viewer ate and never tells them to wait.
    const reminder = localHour < 12
      ? "Lagi banyak kerjaan? Kalau sudah minum atau ngemil, jangan lupa dicatat ya."
      : localHour < 14
        ? "Lagi banyak meeting? Jangan lupa catat makan siang atau cemilanmu ya."
        : "Masih sibuk? Cemilan atau minuman sore juga jangan lupa dicatat ya.";
    const scenes: MascotScene[] = [{
      mood: "work",
      badge: "Kukang menemani kerjamu",
      caption: reminder,
    }, thinkingScene()];
    if (localHour >= 12 && localHour < 14) scenes.push(restScene());
    return scenes;
  }
  if (localHour >= 17 && localHour < 22) {
    return [{
      ...happyScene(),
      badge: localHour < 19 ? "Kukang santai sore" : "Kukang santai malam",
    }, danceScene(), restScene()];
  }
  return [happyScene(), thinkingScene()];
}

/**
 * Food context leads the sequence, then the mascot gets on with its own varied
 * routine. Clock ranges guide compatible poses rather than locking one pose
 * for hours. None of these scenes claims the viewer performed an activity.
 */
export function buildMascotScenes(input: MascotSceneInput): MascotScene[] {
  const { localHour, mealCount, caloriesIn, calorieTarget, proteinToday, proteinTarget, sugar, foodLogComplete } = input;
  const validHour = Number.isFinite(localHour) && localHour >= 0 && localHour < 24;
  const hasMeals = positive(mealCount);

  // Rest remains legible at midnight, even when a new daily log has just reset.
  if (validHour && (localHour >= 22 || localHour < 5)) {
    return [{
      mood: "neutral",
      badge: "Kukang ikut istirahat",
      caption: "Malam sudah larut dan kukang mulai mengantuk.",
    }, restScene(true)];
  }

  let context: MascotScene | undefined;
  // Partial sugar data is a lower bound: missing values cannot turn into zero,
  // but a known subtotal above the reference already supports this reminder.
  if (hasMeals && positive(sugar.knownMeals) && positive(sugar.grams) && sugar.grams > SUGAR_REFERENCE_G) {
    context = {
      mood: "sugar",
      badge: `Gula tambahan: ${Math.round(sugar.grams)} g`,
      caption: `Gula tambahan dari catatan hari ini melewati patokan ${SUGAR_REFERENCE_G} g. Cek lagi pilihan minuman dan camilanmu.`,
    };
  }

  const remainingProtein = proteinTarget - proteinToday;
  const meaningfulProteinGap = positive(proteinTarget)
    && Number.isFinite(proteinToday) && proteinToday >= 0
    && remainingProtein >= Math.max(25, proteinTarget * 0.25);
  // Early or sparse logs should not label an unfinished day as low in protein.
  // Two meals plus enough recorded intake, a late afternoon, or closing the log
  // gives the visual reminder some context without judging an empty log.
  const enoughContext = mealCount >= 2 && (
    (positive(calorieTarget) && Number.isFinite(caloriesIn) && caloriesIn >= calorieTarget * 0.6)
    || foodLogComplete
    || (validHour && localHour >= 16)
  );
  if (!context && hasMeals && meaningfulProteinGap && enoughContext) {
    context = {
      mood: "protein",
      badge: "Ada ruang untuk protein",
      caption: `Protein yang tercatat ${Math.round(proteinToday)} dari ${Math.round(proteinTarget)} g. Bisa tambah pilihan protein di makan berikutnya.`,
    };
  }

  if (!context && hasMeals && foodLogComplete) {
    context = {
      mood: "cheer",
      badge: "Catatan hari ini lengkap",
      caption: "Kukang ikut merayakan catatan yang sudah kamu lengkapi.",
    };
  }

  const routine = routineScenes(validHour ? localHour : NaN);
  const seen = new Set<MascotMood>();
  return [...(context ? [context] : []), ...routine].filter((scene) => {
    if (seen.has(scene.mood)) return false;
    seen.add(scene.mood);
    return true;
  });
}

/** The first pose remains useful for static rendering and existing callers. */
export function resolveMascotScene(input: MascotSceneInput): MascotScene {
  return buildMascotScenes(input)[0];
}

/**
 * The home mascot changes pose on its own: any other scene in the sequence,
 * chosen at random, and never the one already on screen. `random` is injectable
 * so the choice can be tested.
 */
export function pickNextScene(
  scenes: MascotScene[],
  currentMood: MascotMood | undefined,
  random: () => number = Math.random,
): MascotScene {
  const others = scenes.filter((scene) => scene.mood !== currentMood);
  const pool = others.length ? others : scenes;
  const index = Math.floor(random() * pool.length);
  return pool[Math.min(pool.length - 1, Math.max(0, Number.isFinite(index) ? index : 0))];
}
