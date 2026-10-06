import { createHash } from "node:crypto";
import { redis, keys } from "./redis";
import { getDayLog } from "./day";
import { getWeightEntries } from "./weight";
import { getBodyCheckIns } from "./bodyStore";
import { mergeBodySnapshots } from "./body";
import { buildBodyResponse, calendarDates } from "./bodyResponse";
import { todayKey } from "./dates";
import { DEFAULT_SETTINGS, type UserSettings } from "./types";
import { addCalendarDays, buildCalibration } from "./calibration";

export async function loadCalibration(userId: string) {
  const stored = await redis.get<UserSettings>(keys.settings(userId));
  const settings = { ...DEFAULT_SETTINGS, ...stored };
  const today = todayKey(settings.timezone);
  const end = addCalendarDays(today, -1);
  const [logs, weights, checkIns] = await Promise.all([
    Promise.all(calendarDates(end, 28).map((date) => getDayLog(userId, date))),
    getWeightEntries(userId),
    getBodyCheckIns(userId),
  ]);
  const report = buildBodyResponse(
    end,
    28,
    logs,
    mergeBodySnapshots(weights, checkIns),
  );
  const calibration = buildCalibration(today, report, settings);
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        userId,
        today,
        settings,
        days: report.current.days.map(
          ({ date, calories, weight, foodStatus, review }) => ({
            date,
            calories,
            weight,
            foodStatus,
            review: review.filter(
              (code) => code.startsWith("food") || code.startsWith("weight"),
            ),
          }),
        ),
        calibration,
      }),
    )
    .digest("hex");
  return { stored, settings, today, calibration, fingerprint };
}

// Compare-and-set prevents a repeated/concurrent decision from overwriting a
// target/profile changed by another request. Raw body data is recomputed first.
const SAVE_IF_UNCHANGED = `
local function equal(a, b)
  if type(a) ~= type(b) then return false end
  if type(a) ~= 'table' then return a == b end
  for k,v in pairs(a) do if not equal(v,b[k]) then return false end end
  for k,v in pairs(b) do if a[k] == nil then return false end end
  return true
end
local raw = redis.call('GET', KEYS[1])
local current = cjson.null
if raw then current = cjson.decode(raw) end
if not equal(current, cjson.decode(ARGV[1])) then return 0 end
redis.call('SET', KEYS[1], ARGV[2])
return 1
`;
export async function saveCalibrationDecision(
  userId: string,
  expected: UserSettings | null,
  next: UserSettings,
) {
  return (
    (await redis.eval<string[], number>(
      SAVE_IF_UNCHANGED,
      [keys.settings(userId)],
      [JSON.stringify(expected), JSON.stringify(next)],
    )) === 1
  );
}
