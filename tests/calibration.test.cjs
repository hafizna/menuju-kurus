require("./register.cjs");
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildCalibration, addCalendarDays } = require("../lib/calibration");
const { buildBodyResponse } = require("../lib/bodyResponse");
const { buildAdaptiveCoach } = require("../lib/adaptiveCoach");
const { summarizeDay, computeWeeklyBudget } = require("../lib/energy");
const { buildHabitStrategy } = require("../lib/habits");
const { calibrationFixture } = require("./calibration-fixture.cjs");
const result = (f) =>
  buildCalibration(
    f.today,
    buildBodyResponse(addCalendarDays(f.today, -1), 28, f.logs, f.snapshots),
    f.settings,
  );
function coach(f, changes = {}) {
  const log = { ...f.logs.at(-1), foodLogComplete: false, meals: [] };
  return buildAdaptiveCoach({
    log,
    summary: summarizeDay(log, f.settings.dailyTargetKcal),
    weeklyBudget: computeWeeklyBudget([log], f.settings.dailyTargetKcal),
    proteinToday: 120,
    weightTrend: {
      today: 80,
      weeklyRate: -5,
      direction: "down",
      avg7: 80,
      avg14: 80,
      change: 0,
    },
    settings: f.settings,
    habits: buildHabitStrategy([], f.settings),
    moment: "neutral",
    bodyResponse: buildBodyResponse(
      addCalendarDays(f.today, -1),
      28,
      f.logs,
      f.snapshots,
    ),
    ...changes,
  });
}
test("calibration uses closed days and proposes a bounded increase without mutation", () => {
  const f = calibrationFixture();
  const original = JSON.stringify(f);
  const r = result(f);
  assert.equal(r.status, "proposal");
  assert.equal(r.oldTarget, 1800);
  assert.equal(r.proposedTarget, 1850);
  assert.equal(r.estimatedTdee, 2750);
  assert.ok(
    r.tdeeRange[0] < r.estimatedTdee && r.tdeeRange[1] > r.estimatedTdee,
  );
  assert.equal(JSON.stringify(f), original);
  const report = buildBodyResponse(f.today, 28, f.logs, f.snapshots);
  assert.equal(
    buildCalibration(f.today, report, f.settings).status,
    "insufficient",
  );
});
test("wearable energy never changes calibrated maintenance or proposed target", () => {
  const f = calibrationFixture();
  const before = result(f);
  f.logs.forEach(
    (log) =>
      (log.burns = [{ source: "shortcuts", calories: 9000, time: "18:00" }]),
  );
  assert.deepEqual(result(f), before);
});
test("26 complete days and 6 per week are mandatory; sparse/partial days do not become zeros", () => {
  const f = calibrationFixture();
  f.logs[0].foodLogComplete = false;
  f.logs[1].foodLogComplete = false;
  assert.equal(result(f).status, "insufficient"); // 26 total but only 5 first week
  f.logs[1].foodLogComplete = true;
  f.logs[8].foodLogComplete = false;
  assert.equal(result(f).status, "proposal");
  f.logs[15].foodLogComplete = false;
  assert.equal(result(f).status, "insufficient");
});
test("weight sample count, endpoint spread, recency and measurement span guard estimates", () => {
  const f = calibrationFixture();
  f.snapshots = f.snapshots.slice(0, 11);
  assert.equal(result(f).status, "insufficient");
  const g = calibrationFixture();
  g.snapshots = g.snapshots.slice(0, -4);
  assert.equal(result(g).status, "insufficient");
  const h = calibrationFixture();
  h.snapshots = h.snapshots.slice(7);
  assert.equal(result(h).status, "insufficient");
});
test("rapid loss, reversing trends, and endpoint variation pause target proposals", () => {
  const f = calibrationFixture(undefined, { slope: -0.2 });
  assert.equal(result(f).status, "paused");
  assert.ok(result(f).reasons.some((x) => x.includes("1%")));
  const g = calibrationFixture();
  g.snapshots.forEach(
    (row, i) =>
      (row.weightKg.value = i < 14 ? 80 - i * 0.1 : 78.6 + (i - 14) * 0.1),
  );
  assert.equal(result(g).status, "paused");
  assert.ok(result(g).reasons.some((x) => x.includes("konsisten")));
  const h = calibrationFixture();
  h.snapshots
    .slice(0, 7)
    .forEach((row, i) => (row.weightKg.value = i % 2 ? 81.5 : 78.5));
  assert.equal(result(h).status, "paused");
});
test("invalid/outlier food and incomplete or low-BMI profile cannot produce targets", () => {
  const f = calibrationFixture();
  f.logs[0].meals[0].calories = 9000;
  assert.equal(result(f).status, "paused");
  const g = calibrationFixture();
  g.settings.programConfigured = false;
  assert.equal(result(g).status, "paused");
  const h = calibrationFixture();
  h.settings.weightKg = 50;
  assert.equal(result(h).status, "paused");
  const i = calibrationFixture();
  i.logs[0].meals[0].calories = NaN;
  assert.notEqual(result(i).status, "proposal");
});
test("range overlapping active target produces no change; reductions remain bounded", () => {
  const f = calibrationFixture(undefined, {
    intake: 1800,
    slope: 0,
    target: 1500,
  });
  assert.equal(result(f).status, "steady");
  assert.equal(result(f).proposedTarget, null);
  const g = calibrationFixture(undefined, {
    intake: 1800,
    slope: 0,
    target: 2400,
  });
  assert.equal(result(g).proposedTarget, 2300);
  const h = calibrationFixture(undefined, {
    intake: 2600,
    slope: 0,
    target: 800,
  });
  assert.equal(result(h).status, "paused");
});
test("apply or keep decision enforces 28 calendar days before another proposal", () => {
  for (const decision of ["applied", "kept"]) {
    const f = calibrationFixture();
    f.settings.calibrationReview = {
      decision,
      reviewAfter: addCalendarDays(f.today, 28),
    };
    assert.equal(result(f).status, "waiting");
    assert.equal(result(f).proposedTarget, null);
    f.settings.calibrationReview.reviewAfter = f.today;
    assert.equal(result(f).status, "proposal");
  }
});
test("body-aware coach prioritizes rapid loss and keeps maximum three recommendations", () => {
  const f = calibrationFixture(undefined, { slope: -0.15 });
  const r = coach(f);
  assert.equal(r.recommendations[0].id, "body-fast-loss");
  assert.ok(r.recommendations.length <= 3);
  assert.ok(!r.recommendations.some((x) => x.id === "fast-loss"));
  assert.equal(r.status, "watch");
});
test("body-aware coach describes stable weight and changing waist without muscle claims", () => {
  const f = calibrationFixture(undefined, { slope: 0 });
  f.snapshots[0].waistCm = { ...f.snapshots[0].weightKg, value: 92 };
  f.snapshots.at(-1).waistCm = { ...f.snapshots.at(-1).weightKg, value: 90 };
  const r = coach(f);
  assert.ok(r.recommendations.some((x) => x.id === "body-stable-waist"));
  assert.ok(!r.recommendations.some((x) => x.id === "fast-loss"));
});
test("sparse body data suppresses legacy trend claims and lowers coach confidence", () => {
  const f = calibrationFixture();
  f.snapshots = f.snapshots.slice(-1);
  const r = coach(f);
  assert.equal(r.confidence, "low");
  assert.ok(r.recommendations.some((x) => x.id === "body-data"));
  assert.ok(
    !r.recommendations.some((x) =>
      ["fast-loss", "body-fast-loss", "trend-up"].includes(x.id),
    ),
  );
});

test("irregular measurement dates use their mean dates rather than a nominal 28-day divisor", () => {
  const f = calibrationFixture();
  const indices = [0, 2, 6, 8, 10, 12, 15, 18, 20, 21, 24, 27];
  f.snapshots = f.snapshots.filter((_, i) => indices.includes(i));
  const r = result(f);
  assert.equal(r.status, "proposal");
  assert.equal(r.weeklyRate, -0.14);
  assert.equal(r.estimatedTdee, 2750);
});
test("low confirmed intake and below-floor active targets pause instead of offering further cuts", () => {
  const f = calibrationFixture(undefined, {
    intake: 1400,
    slope: -0.02,
    target: 1800,
  });
  assert.equal(result(f).status, "paused");
  assert.equal(result(f).proposedTarget, null);
  const g = calibrationFixture(undefined, {
    intake: 1700,
    slope: 0,
    target: 1250,
  });
  assert.equal(result(g).status, "paused");
});
