import type { DayLog, MealEntry, UserSettings } from "./types";

export type HabitReadiness = "insufficient" | "learning" | "ready";
export type HabitInsightTone = "supportive" | "watch" | "neutral";

export interface HabitMeal {
  key: string;
  name: string;
  count: number;
  daysSeen: number;
  averageCalories: number;
  averageProteinG: number;
  averageCarbsG: number;
  averageFatG: number;
  portionNote?: string;
  usualWindow: string;
  lastSeenDate: string;
  confidence: "emerging" | "established";
}

export interface HabitWindow {
  id: string;
  label: string;
  count: number;
  sharePercent: number;
  averageCalories: number;
}

export interface HabitInsight {
  id: string;
  tone: HabitInsightTone;
  title: string;
  detail: string;
  evidence: string;
}

export interface HabitStrategy {
  lookbackDays: number;
  loggedDays: number;
  mealCount: number;
  readiness: HabitReadiness;
  readinessPercent: number;
  readinessMessage: string;
  recurringMeals: HabitMeal[];
  mealWindows: HabitWindow[];
  insights: HabitInsight[];
  dataNote: string;
}

type MealAccumulator = {
  displayNames: Map<string, number>;
  meals: Array<{ meal: MealEntry; date: string; window: string }>;
  days: Set<string>;
};

type WindowAccumulator = { count: number; calories: number };

const WINDOW_ORDER = ["pagi", "siang", "sore", "malam", "larut"] as const;
const WINDOW_LABELS: Record<(typeof WINDOW_ORDER)[number], string> = {
  pagi: "Pagi · 05.00–10.59",
  siang: "Siang · 11.00–14.59",
  sore: "Sore · 15.00–17.59",
  malam: "Malam · 18.00–21.59",
  larut: "Larut malam · 22.00–04.59",
};

function normalizeFoodName(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(porsi|ukuran|estimasi|restoran|manual)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function localHour(timestamp: string, timezone: string): number | null {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return Number.isFinite(hour) ? hour : null;
}

function windowId(timestamp: string, timezone: string): (typeof WINDOW_ORDER)[number] {
  const hour = localHour(timestamp, timezone);
  if (hour === null || hour < 5 || hour >= 22) return "larut";
  if (hour < 11) return "pagi";
  if (hour < 15) return "siang";
  if (hour < 18) return "sore";
  return "malam";
}

function roundAverage(total: number, count: number): number {
  return count ? Math.round(total / count) : 0;
}

function mostCommon(values: string[]): string | undefined {
  if (!values.length) return undefined;
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
}

function readiness(loggedDays: number, mealCount: number): HabitReadiness {
  if (loggedDays < 4 || mealCount < 8) return "insufficient";
  if (loggedDays < 10 || mealCount < 20) return "learning";
  return "ready";
}

function readinessText(state: HabitReadiness, loggedDays: number, mealCount: number): string {
  if (state === "insufficient") {
    return `Baru ada ${loggedDays} hari dengan catatan dan ${mealCount} makanan. Terus catat seperti biasa; pola belum akan disimpulkan.`;
  }
  if (state === "learning") {
    return `Pola awal mulai terlihat dari ${loggedDays} hari dan ${mealCount} makanan, tetapi masih dianggap sementara.`;
  }
  return `Data ${loggedDays} hari dan ${mealCount} makanan sudah cukup untuk menampilkan pola berulang dengan hati-hati.`;
}

function buildRecurringMeals(groups: Map<string, MealAccumulator>): HabitMeal[] {
  return [...groups.entries()]
    .filter(([, group]) => group.meals.length >= 2)
    .map(([key, group]) => {
      const count = group.meals.length;
      const name = [...group.displayNames.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? key;
      const calories = group.meals.reduce((sum, item) => sum + item.meal.calories, 0);
      const protein = group.meals.reduce((sum, item) => sum + item.meal.protein_g, 0);
      const carbs = group.meals.reduce((sum, item) => sum + item.meal.carbs_g, 0);
      const fat = group.meals.reduce((sum, item) => sum + item.meal.fat_g, 0);
      const usualWindow = mostCommon(group.meals.map((item) => item.window)) ?? "waktu bervariasi";
      const portionNote = mostCommon(group.meals.map((item) => item.meal.portionNote).filter((note): note is string => Boolean(note)));
      const lastSeenDate = [...group.meals].sort((a, b) => b.date.localeCompare(a.date))[0]?.date ?? "";
      const confidence: HabitMeal["confidence"] = count >= 4 && group.days.size >= 3 ? "established" : "emerging";
      return {
        key,
        name,
        count,
        daysSeen: group.days.size,
        averageCalories: roundAverage(calories, count),
        averageProteinG: roundAverage(protein, count),
        averageCarbsG: roundAverage(carbs, count),
        averageFatG: roundAverage(fat, count),
        portionNote,
        usualWindow,
        lastSeenDate,
        confidence,
      };
    })
    .sort((a, b) => b.count - a.count || b.daysSeen - a.daysSeen || b.lastSeenDate.localeCompare(a.lastSeenDate))
    .slice(0, 8);
}

function buildMealWindows(windows: Map<string, WindowAccumulator>, mealCount: number): HabitWindow[] {
  return WINDOW_ORDER.map((id) => {
    const item = windows.get(id) ?? { count: 0, calories: 0 };
    return {
      id,
      label: WINDOW_LABELS[id],
      count: item.count,
      sharePercent: mealCount ? Math.round((item.count / mealCount) * 100) : 0,
      averageCalories: roundAverage(item.calories, item.count),
    };
  }).filter((item) => item.count > 0);
}

function buildInsights(
  state: HabitReadiness,
  logs: DayLog[],
  recurringMeals: HabitMeal[],
  mealWindows: HabitWindow[],
  settings: UserSettings
): HabitInsight[] {
  if (state === "insufficient") return [];

  const loggedLogs = logs.filter((log) => log.meals.length > 0);
  const onTrackDays = loggedLogs.filter((log) => {
    const net = log.meals.reduce((sum, meal) => sum + meal.calories, 0) - log.burns.reduce((sum, burn) => sum + burn.calories, 0);
    return net <= settings.dailyTargetKcal;
  }).length;
  const onTrackPercent = loggedLogs.length ? Math.round((onTrackDays / loggedLogs.length) * 100) : 0;
  const insights: HabitInsight[] = [];

  const proteinAnchor = recurringMeals.find(
    (meal) => meal.averageProteinG >= Math.min(25, settings.proteinTargetG * 0.2) && meal.averageCalories <= settings.dailyTargetKcal * 0.35
  );
  if (proteinAnchor) {
    insights.push({
      id: "protein-anchor",
      tone: "supportive",
      title: `${proteinAnchor.name} terlihat sebagai menu andalan`,
      detail: "Menu ini berulang, relatif tinggi protein, dan tidak menggunakan porsi kalori harian yang terlalu besar.",
      evidence: `${proteinAnchor.count} kali · rata-rata ${proteinAnchor.averageCalories} kcal dan ${proteinAnchor.averageProteinG} g protein`,
    });
  }

  const largeMeal = recurringMeals.find((meal) => meal.averageCalories >= settings.dailyTargetKcal * 0.42);
  if (largeMeal) {
    insights.push({
      id: "large-repeat",
      tone: "watch",
      title: `${largeMeal.name} memakai bagian besar dari budget harian`,
      detail: "Bukan berarti harus dihindari. Saat memilihnya, porsi dan makanan lain pada hari yang sama perlu dibuat lebih sadar.",
      evidence: `${largeMeal.count} kali · rata-rata ${largeMeal.averageCalories} kcal`,
    });
  }

  const lateWindow = mealWindows.find((window) => window.id === "larut" && window.count >= 3 && window.sharePercent >= 15);
  if (lateWindow) {
    insights.push({
      id: "late-window",
      tone: "neutral",
      title: "Makan larut malam cukup sering muncul",
      detail: "Jam makan bukan otomatis masalah. Pola ini ditampilkan agar coach berikutnya dapat mempertimbangkan rasa lapar, jadwal tidur, dan total harian secara kontekstual.",
      evidence: `${lateWindow.count} makanan · ${lateWindow.sharePercent}% dari catatan`,
    });
  }

  if (loggedLogs.length >= 5) {
    insights.push({
      id: "on-track-rate",
      tone: onTrackPercent >= 70 ? "supportive" : onTrackPercent < 45 ? "watch" : "neutral",
      title: `${onTrackPercent}% hari tercatat berada dalam target`,
      detail:
        onTrackPercent >= 70
          ? "Konsistensi harian terlihat lebih kuat daripada mengejar hari yang sempurna."
          : onTrackPercent < 45
            ? "Pola ini belum menunjukkan penyebab. Gunakan sebagai sinyal untuk meninjau porsi, menu berulang, dan hari dengan aktivitas rendah."
            : "Pola masih campuran dan sebaiknya dilihat bersama tren berat serta rasa lapar.",
      evidence: `${onTrackDays} dari ${loggedLogs.length} hari dengan catatan`,
    });
  }

  return insights.slice(0, 4);
}

export function buildHabitStrategy(logs: DayLog[], settings: UserSettings): HabitStrategy {
  const groups = new Map<string, MealAccumulator>();
  const windows = new Map<string, WindowAccumulator>();
  const loggedDays = logs.filter((log) => log.meals.length > 0).length;
  const mealCount = logs.reduce((sum, log) => sum + log.meals.length, 0);

  for (const log of logs) {
    for (const meal of log.meals) {
      const key = normalizeFoodName(meal.foodName);
      if (!key) continue;
      const window = windowId(meal.time, settings.timezone);
      const group = groups.get(key) ?? { displayNames: new Map<string, number>(), meals: [], days: new Set<string>() };
      group.displayNames.set(meal.foodName, (group.displayNames.get(meal.foodName) ?? 0) + 1);
      group.meals.push({ meal, date: log.date, window: WINDOW_LABELS[window] });
      group.days.add(log.date);
      groups.set(key, group);

      const windowGroup = windows.get(window) ?? { count: 0, calories: 0 };
      windowGroup.count += 1;
      windowGroup.calories += meal.calories;
      windows.set(window, windowGroup);
    }
  }

  const state = readiness(loggedDays, mealCount);
  const recurringMeals = buildRecurringMeals(groups);
  const mealWindows = buildMealWindows(windows, mealCount);
  const readinessPercent = Math.min(100, Math.round(Math.min(loggedDays / 10, mealCount / 20) * 100));

  return {
    lookbackDays: logs.length,
    loggedDays,
    mealCount,
    readiness: state,
    readinessPercent,
    readinessMessage: readinessText(state, loggedDays, mealCount),
    recurringMeals,
    mealWindows,
    insights: buildInsights(state, logs, recurringMeals, mealWindows, settings),
    dataNote:
      "Habit Intelligence merangkum 28 hari terakhir. Hubungan yang ditampilkan bersifat pola penggunaan, bukan bukti sebab-akibat atau penilaian medis.",
  };
}
