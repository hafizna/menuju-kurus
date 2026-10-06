require("./register.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildBodyResponse, calendarDates } = require("../lib/bodyResponse");
const end = "2026-10-05";
const reading = (value) => ({
  value,
  source: "manual",
  recordedAt: end + "T00:00:00Z",
  heightCm: 170,
});
const log = (date, overrides = {}) => ({
  date,
  meals: [{ calories: 1800, protein_g: 120 }],
  burns: [{ source: "shortcuts", calories: 250, time: "12:00" }],
  foodLogComplete: true,
  ...overrides,
});
function fixture(n = 28) {
  const dates = calendarDates(end, n * 2);
  const logs = dates.map((date) => log(date));
  const snapshots = dates.map((date, i) => ({
    date,
    weightKg: reading(80 - i * 0.01),
    ...([0, n - 1, n, n * 2 - 1].includes(i)
      ? { waistCm: reading(90 - i * 0.02) }
      : {}),
  }));
  return { logs, snapshots };
}
test("empty dates stay unknown; calendar windows are adjacent and equal", () => {
  const r = buildBodyResponse(end, 28, [], []);
  assert.equal(r.current.days.length, 28);
  assert.equal(r.previous.days.length, 28);
  assert.equal(r.current.food.average, null);
  assert.equal(r.current.activity.average, null);
  assert.equal(r.current.weight.change, null);
  assert.deepEqual(r.insights, []);
  assert.equal(r.previous.end, "2026-09-07");
  assert.equal(r.current.start, "2026-09-08");
  assert.equal(new Set(calendarDates("2026-11-03", 56)).size, 56);
});
test("partial intake is visible but excluded; explicit zero is retained and reviewed", () => {
  const dates = calendarDates(end, 14);
  const r = buildBodyResponse(
    end,
    14,
    [log(dates[0], { foodLogComplete: false }), log(end, { meals: [] })],
    [],
  );
  assert.equal(r.current.days[0].recordedCalories, 1800);
  assert.equal(r.current.days[0].calories, null);
  assert.equal(r.current.food.average, 0);
  assert.equal(r.current.food.observedDays, 1);
  assert.ok(r.current.days.at(-1).review.includes("food-review"));
  assert.equal(r.current.food.ready, false);
});
test("ready reports use matching periods, endpoint weight means and descriptive insights", () => {
  const f = fixture();
  const frozen = JSON.stringify(f);
  const r = buildBodyResponse(end, 28, f.logs, f.snapshots);
  assert.equal(r.current.food.ready, true);
  assert.equal(r.current.weight.ready, true);
  assert.equal(r.current.waist.ready, true);
  assert.equal(r.current.weight.change, -0.21);
  assert.equal(r.current.weight.baselineSamples, 7);
  assert.equal(r.insights.length, 3);
  assert.equal(r.comparison.calories, 0);
  assert.equal(JSON.stringify(f), frozen);
});
test("75 percent total coverage also requires distribution across both halves", () => {
  const dates = calendarDates(end, 28);
  const r = buildBodyResponse(
    end,
    28,
    dates.slice(7).map((date) => log(date)),
    [],
  );
  assert.equal(r.current.food.observedDays, 21);
  assert.equal(r.current.food.ready, false);
  assert.ok(r.current.food.reasons.some((s) => s.includes("paruh awal")));
  const distributed = dates
    .filter((_, i) => i % 4 !== 3)
    .map((date) => log(date));
  assert.equal(
    buildBodyResponse(end, 28, distributed, []).current.food.ready,
    true,
  );
});
test("weight sample thresholds scale with period; missing endpoints and short spans pause insights", () => {
  for (const [n, min] of [
    [14, 4],
    [28, 8],
    [56, 16],
  ]) {
    const f = fixture(n);
    const r = buildBodyResponse(end, n, f.logs, f.snapshots);
    assert.equal(r.policies.minimumWeightSamples, min);
    assert.equal(r.current.weight.ready, true);
    const sparse = f.snapshots.slice(-n).slice(7, -7);
    assert.equal(
      buildBodyResponse(end, n, f.logs, sparse).current.weight.ready,
      false,
    );
  }
  const dates = calendarDates(end, 14);
  const rows = dates
    .slice(5, 9)
    .map((date) => ({ date, weightKg: reading(80), waistCm: reading(90) }));
  const r = buildBodyResponse(end, 14, [], rows);
  assert.equal(r.current.weight.ready, false);
  assert.equal(r.current.waist.ready, false);
});
test("outliers remain displayed and averaged but pause related insights", () => {
  const f = fixture();
  f.logs.at(-1).meals[0].calories = 9000;
  f.snapshots.at(-1).weightKg = reading(100);
  const r = buildBodyResponse(end, 28, f.logs, f.snapshots);
  assert.equal(r.current.days.at(-1).calories, 9000);
  assert.equal(r.current.food.average, 2057.14);
  assert.equal(r.current.days.at(-1).weight, 100);
  assert.equal(r.current.weight.ready, false);
  assert.equal(r.current.food.ready, false);
  assert.ok(!r.insights.some((x) => x.id === "food-weight"));
});
test("invalid protein does not discard valid calories; invalid body values stay unknown", () => {
  const r = buildBodyResponse(
    end,
    14,
    [log(end, { meals: [{ calories: 1800, protein_g: NaN }] })],
    [{ date: end, weightKg: reading(-1) }],
  );
  assert.equal(r.current.days.at(-1).calories, 1800);
  assert.equal(r.current.days.at(-1).protein, null);
  assert.equal(r.current.days.at(-1).weight, null);
  assert.ok(r.current.days.at(-1).review.includes("weight-invalid"));
});
test("latest Apple snapshot wins over overlapping manual entries, including explicit zero", () => {
  const r = buildBodyResponse(
    end,
    14,
    [
      log(end, {
        burns: [
          { source: "manual", calories: 100, time: "18:00" },
          { source: "shortcuts", calories: 250, time: "12:00" },
          { source: "shortcuts", calories: 0, time: "19:00" },
        ],
      }),
    ],
    [],
  );
  assert.equal(r.current.activity.average, 0);
  assert.equal(r.current.activity.observedDays, 1);
  assert.equal(r.current.days.at(-1).activitySource, "apple_health");
});
test("mixed sources and source changes suppress activity comparisons", () => {
  const f = fixture();
  f.logs[0].burns = [{ source: "manual", calories: 250, time: "12:00" }];
  let r = buildBodyResponse(end, 28, f.logs, f.snapshots);
  assert.equal(r.previous.activity.ready, false);
  assert.equal(r.comparison.activity, null);
  for (let i = 0; i < 28; i++)
    f.logs[i].burns = [{ source: "manual", calories: 250, time: "12:00" }];
  r = buildBodyResponse(end, 28, f.logs, f.snapshots);
  assert.equal(r.previous.activity.ready, true);
  assert.equal(r.current.activity.ready, true);
  assert.equal(r.comparison.activity, null);
});
