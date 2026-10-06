const { test } = require("node:test");
const assert = require("node:assert/strict");
const {
  mergeBodySnapshots,
  bodyRatios,
  comparisonRows,
  avatarHeight,
  avatarHalfWidth,
  metricPoints,
  checkInDue,
} = require("../lib/body");
const reading = (value, heightCm = 170) => ({
  value,
  heightCm,
  source: "manual",
  recordedAt: "2026-09-01T00:00:00Z",
});

test("legacy weights merge on their dates without guessed historical height or duplicate snapshots", () => {
  const weights = [
    {
      id: "legacy",
      date: "2026-09-01",
      weightKg: 78,
      bodyFat: 22,
      source: "shortcuts",
      createdAt: "2026-09-01T05:00:00Z",
    },
  ];
  const snapshots = mergeBodySnapshots(weights, [
    { date: "2026-09-01", waistCm: reading(92) },
    { date: "2026-09-02", hipCm: reading(100) },
  ]);
  assert.equal(snapshots.length, 2);
  assert.equal(snapshots[0].weightKg.heightCm, null);
  assert.equal(snapshots[0].bodyFatPercent.source, "shortcuts");
  assert.equal(bodyRatios(snapshots[0]).bmi, null);
  assert.equal(bodyRatios(snapshots[0]).whr, null); // next day's hip is not reused
  assert.equal(bodyRatios(snapshots[0]).whtr, 0.54);
});

test("derived ratios use field-specific historical height and same-day measurements", () => {
  const snapshot = {
    date: "2026-09-01",
    weightKg: reading(78, 175),
    waistCm: reading(90, 170),
    hipCm: reading(100, 170),
    thighCm: reading(60, 170),
  };
  assert.deepEqual(bodyRatios(snapshot), {
    bmi: 25.47,
    whtr: 0.53,
    whr: 0.9,
    wtr: 1.5,
  });
});

test("comparison only reports matched fields on chronologically different dates", () => {
  const before = {
    date: "2026-09-01",
    waistCm: reading(92),
    hipCm: reading(100),
  };
  const after = {
    date: "2026-09-29",
    waistCm: reading(90),
    thighCm: reading(55),
  };
  const rows = comparisonRows(before, after);
  assert.equal(rows.find((row) => row.field === "waistCm").delta, -2);
  assert.equal(rows.find((row) => row.field === "hipCm").delta, null);
  assert.equal(rows.find((row) => row.field === "thighCm").before, null);
  assert.ok(comparisonRows(after, before).every((row) => row.delta === null));
  assert.ok(comparisonRows(after, after).every((row) => row.delta === null));
});

test("avatar requires compatible recorded heights, and its mapping is monotonic and bounded", () => {
  assert.equal(
    avatarHeight({ date: "2026-09-01", weightKg: reading(78) }),
    null,
  );
  assert.equal(
    avatarHeight({ date: "2026-09-01", waistCm: reading(90, null) }),
    null,
  );
  assert.equal(
    avatarHeight({
      date: "2026-09-01",
      waistCm: reading(90),
      hipCm: reading(100, 180),
    }),
    null,
  );
  assert.equal(
    avatarHeight({
      date: "2026-09-01",
      waistCm: reading(90),
      hipCm: reading(100),
    }),
    170,
  );
  assert.ok(avatarHalfWidth(90, 170) < avatarHalfWidth(100, 170));
  assert.ok(avatarHalfWidth(1, 170) >= 12);
  assert.ok(avatarHalfWidth(1000, 170) <= 44);
});

test("weight smoothing uses a calendar window, not the last seven entries", () => {
  const snapshots = [
    { date: "2026-09-01", weightKg: reading(80) },
    { date: "2026-09-20", weightKg: reading(70) },
    { date: "2026-09-21", weightKg: reading(69) },
  ];
  const points = metricPoints(snapshots, "weightKg");
  assert.equal(points[1].average7, null);
  assert.equal(points[2].average7, 69.5);
  assert.equal(points[2].samples7, 2);
  assert.equal(
    metricPoints([{ date: "2026-09-01", waistCm: reading(90) }], "waistCm")[0]
      .average7,
    null,
  );
});

test("check-in cadence distinguishes weekly waist and optional fortnightly measurements", () => {
  const snapshots = [
    { date: "2026-09-01", waistCm: reading(90), hipCm: reading(100) },
  ];
  assert.equal(checkInDue(snapshots, "waistCm", "2026-09-08").due, true);
  assert.equal(checkInDue(snapshots, "hipCm", "2026-09-08").due, false);
  assert.equal(checkInDue(snapshots, "hipCm", "2026-09-15").due, true);
  assert.equal(checkInDue(snapshots, "thighCm", "2026-09-02").days, null);
});
