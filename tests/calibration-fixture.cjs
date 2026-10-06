require("./register.cjs");
const { calendarDates } = require("../lib/bodyResponse");
const { DEFAULT_SETTINGS } = require("../lib/types");
const { addCalendarDays } = require("../lib/calibration");
function calibrationFixture(
  today = "2026-10-05",
  { intake = 2600, slope = -0.02, target = 1800 } = {},
) {
  const dates = calendarDates(addCalendarDays(today, -1), 28);
  const settings = {
    ...DEFAULT_SETTINGS,
    age: 30,
    biologicalSex: "male",
    heightCm: 170,
    activityLevel: "light",
    weightKg: 80,
    programConfigured: true,
    dailyTargetKcal: target,
  };
  const logs = dates.map((date) => ({
    date,
    foodLogComplete: true,
    plan: "deficit",
    meals: [
      {
        id: `m-${date}`,
        time: date + "T05:00:00Z",
        foodName: "Makanan uji",
        calories: intake,
        protein_g: 120,
        carbs_g: 200,
        fat_g: 60,
        source: "manual",
      },
    ],
    burns: [],
  }));
  const snapshots = dates.map((date, i) => ({
    date,
    weightKg: {
      value: 80 + i * slope,
      source: "manual",
      recordedAt: date + "T05:00:00Z",
      heightCm: 170,
    },
  }));
  const weights = snapshots.map((row) => ({
    id: `w-${row.date}`,
    date: row.date,
    weightKg: row.weightKg.value,
    heightCm: 170,
    createdAt: row.weightKg.recordedAt,
    source: "manual",
  }));
  return { today, dates, settings, logs, snapshots, weights };
}
module.exports = { calibrationFixture };
