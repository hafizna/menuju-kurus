const http = require("node:http");
const { spawn } = require("node:child_process");
const { randomBytes, scryptSync } = require("node:crypto");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const { chromium } = require("playwright-core");
const path = require("node:path");
const projectRoot = path.resolve(__dirname, "..");
require("./register.cjs");
const { DEFAULT_SETTINGS } = require("../lib/types");
const { todayKey } = require("../lib/dates");
const today = todayKey("Asia/Jakarta");
const offset = (days) =>
  new Date(Date.parse(today) - days * 86400000).toISOString().slice(0, 10);
const beforeDate = offset(21);
const store = new Map();
const put = (key, value) => store.set(key, JSON.stringify(value));
put("mk:u3:settings", {
  ...DEFAULT_SETTINGS,
  heightCm: 170,
  weightKg: 77.4,
  goalWeightKg: 72,
  programConfigured: true,
});
const testPin = "483920";
const pinSalt = randomBytes(16).toString("hex");
put("mk:u3:pin", {
  hash: scryptSync(testPin, pinSalt, 64).toString("hex"),
  salt: pinSalt,
  setAt: new Date().toISOString(),
});
put("mk:u3:weight", [
  {
    id: "old",
    date: beforeDate,
    weightKg: 78,
    heightCm: 170,
    createdAt: beforeDate + "T05:00:00Z",
    source: "manual",
  },
  {
    id: "new",
    date: today,
    weightKg: 77.4,
    heightCm: 170,
    createdAt: today + "T05:00:00Z",
    source: "shortcuts",
  },
]);
const reading = (value, date) => ({
  value,
  source: "manual",
  heightCm: 170,
  recordedAt: date + "T05:00:00Z",
});
put("mk:u3:body", [
  {
    date: beforeDate,
    waistCm: reading(92, beforeDate),
    hipCm: reading(100, beforeDate),
    thighCm: reading(55, beforeDate),
  },
  {
    date: today,
    waistCm: reading(90, today),
    hipCm: reading(99, today),
    thighCm: reading(55, today),
  },
]);
for (let i = 0; i < 28; i++)
  put(`mk:u3:day:${offset(i)}`, {
    date: offset(i),
    meals: [
      {
        id: `meal-${i}`,
        calories: 1800,
        protein_g: 120,
        carbs_g: 200,
        fat_g: 60,
        foodName: "Catatan uji",
        time: "12:00",
        source: "manual",
      },
    ],
    burns: [
      { id: `burn-${i}`, calories: 250, source: "shortcuts", time: "18:00" },
    ],
    foodLogComplete: i % 4 !== 3,
  });
const weights = JSON.parse(store.get("mk:u3:weight"));
for (const i of [26, 25, 20, 13, 8, 1])
  weights.push({
    id: `weight-${i}`,
    date: offset(i),
    weightKg: 77.4 + i * 0.03,
    heightCm: 170,
    createdAt: offset(i) + "T05:00:00Z",
    source: "manual",
  });
put("mk:u3:weight", weights);
const apiErrors = [],
  browserErrors = [];
const redisToken = randomBytes(16).toString("hex");
const backend = http.createServer(async (req, res) => {
  if (req.headers.authorization !== `Bearer ${redisToken}`) {
    res.writeHead(401);
    res.end('{"error":"Unauthorized"}');
    return;
  }
  try {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw);
    function execute(command) {
      const op = String(command[0]).toLowerCase(),
        key = command[1];
      let result;
      if (op === "get") result = store.get(key) ?? null;
      else if (op === "set") {
        store.set(
          key,
          typeof command[2] === "string"
            ? command[2]
            : JSON.stringify(command[2]),
        );
        result = "OK";
      } else if (op === "eval") {
        const evalKey = command[3];
        const expected = JSON.parse(command[4]);
        const current = store.has(evalKey)
          ? JSON.parse(store.get(evalKey))
          : null;
        if (!require("node:util").isDeepStrictEqual(current, expected))
          result = 0;
        else {
          store.set(evalKey, command[5]);
          result = 1;
        }
      } else throw new Error("Unsupported test command " + op);
      if (
        typeof result === "string" &&
        req.headers["upstash-encoding"] === "base64"
      )
        result = Buffer.from(result).toString("base64");
      return { result };
    }
    const result = Array.isArray(body[0]) ? body.map(execute) : execute(body);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (error) {
    apiErrors.push(error.message);
    res.writeHead(500);
    res.end(JSON.stringify({ error: error.message }));
  }
});
let child, browser;
(async () => {
  await new Promise((resolve) => backend.listen(0, "127.0.0.1", resolve));
  const backendPort = backend.address().port;
  const portProbe = http.createServer();
  await new Promise((resolve) => portProbe.listen(0, "127.0.0.1", resolve));
  const appPort = portProbe.address().port;
  await new Promise((resolve) => portProbe.close(resolve));
  child = spawn(
    process.execPath,
    [
      "node_modules/next/dist/bin/next",
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(appPort),
    ],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        SESSION_SECRET: randomBytes(32).toString("hex"),
        USER1_EMAIL: "",
        USER2_EMAIL: "",
        USER3_EMAIL: "test-user-3@example.com",
        USER3_NAME: "Pengguna uji",
        UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${backendPort}`,
        UPSTASH_REDIS_REST_TOKEN: redisToken,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let logs = "";
  child.stdout.on("data", (chunk) => (logs += chunk));
  child.stderr.on("data", (chunk) => (logs += chunk));
  for (let i = 0; i < 60; i++) {
    if (child.exitCode !== null)
      throw new Error("Test server exited before readiness");
    try {
      if ((await fetch(`http://127.0.0.1:${appPort}/login`)).ok) break;
    } catch {}
    if (i === 59) throw new Error("App failed to start");
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  browser = await chromium.launch({
    executablePath:
      process.env.PLAYWRIGHT_EXECUTABLE_PATH || "/usr/bin/chromium",
    headless: true,
    args: ["--no-sandbox"],
  });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    timezoneId: "Asia/Jakarta",
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await page.goto(`http://127.0.0.1:${appPort}/login`);
  await page.getByRole("button", { name: "Masuk dengan PIN", exact: true }).click();
  await page.locator("input[type=password]").fill(testPin);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL(`http://127.0.0.1:${appPort}/`);
  await page.getByText(/\/ 1800 kcal$/).first().waitFor();
  await page.goto(`http://127.0.0.1:${appPort}/progress`);
  await page
    .getByRole("heading", { name: "Lihat pola, beri tubuh waktu" })
    .waitFor();
  assert.equal(
    await page
      .getByRole("tab", { name: "Ringkasan" })
      .getAttribute("aria-selected"),
    "true",
  );
  await page
    .getByRole("heading", { name: "Body Response · 28 hari", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "14 hari", exact: true }).click();
  await page
    .getByRole("heading", { name: "Body Response · 14 hari", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "56 hari", exact: true }).click();
  await page
    .getByRole("heading", { name: "Body Response · 56 hari", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "28 hari", exact: true }).click();
  await page
    .getByRole("heading", { name: "Body Response · 28 hari", exact: true })
    .waitFor();
  await page
    .getByText("Catatan harian dan kualitas data", { exact: true })
    .click();
  await page.setViewportSize({ width: 320, height: 720 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "Body Response overflow",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByText("Catatan harian dan kualitas data", { exact: true })
    .click();
  await page.route("**/api/body-response?*", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"error":"test failure"}',
    }),
  );
  await page.getByRole("button", { name: "14 hari", exact: true }).click();
  await page
    .getByRole("button", { name: "Coba muat Body Response lagi", exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("heading", { name: "Body Response · 28 hari", exact: true })
      .count(),
    0,
    "stale report after request failure",
  );
  await page.unroute("**/api/body-response?*");
  await page
    .getByRole("button", { name: "Coba muat Body Response lagi", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Body Response · 14 hari", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "28 hari", exact: true }).click();
  await page
    .getByRole("heading", { name: "Body Response · 28 hari", exact: true })
    .waitFor();
  await fs.mkdir(path.join(projectRoot, ".next/validation"), {
    recursive: true,
  });
  await page.screenshot({
    path: path.join(
      projectRoot,
      ".next/validation/progress-overview-mobile.png",
    ),
    fullPage: true,
  });
  await page.getByRole("tab", { name: "Tubuh", exact: true }).click();
  await page.getByRole("heading", { name: "Bandingkan dua tanggal" }).waitFor();
  assert.equal(await page.locator("figure").count(), 2);
  assert.ok(
    (await page.locator("table").first().innerText()).includes("-2 cm"),
  );
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "mobile horizontal overflow",
  );
  await page.screenshot({
    path: path.join(projectRoot, ".next/validation/progress-body-mobile.png"),
    fullPage: true,
  });
  const visibility = page.getByRole("checkbox", {
    name: "Tampilkan ilustrasi tubuh",
  });
  await visibility.uncheck();
  assert.equal(await page.locator("figure").count(), 0);
  await page.reload();
  await page.getByRole("heading", { name: "Bandingkan dua tanggal" }).waitFor();
  assert.equal(
    await page
      .getByRole("checkbox", { name: "Tampilkan ilustrasi tubuh" })
      .isChecked(),
    false,
  );
  await page
    .getByRole("checkbox", { name: "Tampilkan ilustrasi tubuh" })
    .check();
  await page
    .getByRole("button", { name: "+ Check-in tubuh", exact: true })
    .click();
  await page.getByLabel("Pinggang (cm)", { exact: true }).fill("89");
  await page
    .getByRole("button", { name: "Simpan ukuran", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Pengukuran tersimpan" })
    .waitFor();
  let rows = JSON.parse(store.get("mk:u3:body"));
  assert.equal(rows.find((row) => row.date === today).waistCm.value, 89);
  assert.equal(rows.find((row) => row.date === today).hipCm.value, 99);
  assert.equal(
    JSON.parse(store.get("mk:u3:weight")).find((row) => row.date === today)
      .source,
    "shortcuts",
    "editing waist changed weight provenance",
  );
  await page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: today + " ·" }) })
    .locator("summary")
    .click();
  page.once("dialog", (dialog) => dialog.accept());
  await page
    .getByRole("button", { name: `Hapus Paha tanggal ${today}`, exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Ukuran dihapus" })
    .waitFor();
  rows = JSON.parse(store.get("mk:u3:body"));
  assert.equal(rows.find((row) => row.date === today).thighCm, undefined);
  assert.equal(rows.find((row) => row.date === today).waistCm.value, 89);
  await page.goto(`http://127.0.0.1:${appPort}/progress?tab=weight`);
  await page.getByRole("heading", { name: "Bandingkan dua tanggal" }).waitFor();
  assert.equal(
    await page
      .getByRole("tab", { name: "Tubuh", exact: true })
      .getAttribute("aria-selected"),
    "true",
  );
  await page.setViewportSize({ width: 320, height: 720 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "320px horizontal overflow",
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "desktop horizontal overflow",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  // Keyboard tab navigation and unknown-data/error states are separate checks.
  await page.getByRole("tab", { name: "Tubuh", exact: true }).focus();
  await page.keyboard.press("ArrowLeft");
  await page
    .getByRole("heading", { name: "Lihat pola, beri tubuh waktu" })
    .waitFor();
  await page.getByRole("tab", { name: "Fitness", exact: true }).click();
  await page.getByText("Prioritas berikutnya", { exact: true }).waitFor();
  await page.getByRole("tab", { name: "Mingguan", exact: true }).click();
  await page.getByText("Ringkasan Minggu Ini", { exact: true }).waitFor();
  await page.route("**/api/body", (route) =>
    route.fulfill({
      status: 500,
      contentType: "application/json",
      body: '{"error":"test failure"}',
    }),
  );
  await page.getByRole("tab", { name: "Tubuh", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Pengukuran belum dapat dimuat" })
    .waitFor();
  await page.unroute("**/api/body");
  await page.getByRole("button", { name: "Coba lagi", exact: true }).click();
  await page.getByRole("heading", { name: "Bandingkan dua tanggal" }).waitFor();
  await page.route("**/api/body", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        snapshots: [],
        today,
        profileHeightCm: null,
        weightTrend: {
          today: null,
          avg7: null,
          avg14: null,
          change: null,
          weeklyRate: null,
          direction: "unknown",
        },
      }),
    }),
  );
  await page.reload();
  await page
    .getByRole("heading", { name: "Mulai dari berat atau pinggang" })
    .waitFor();
  assert.equal(await page.locator("figure").count(), 0);
  await page.unroute("**/api/body");
  await page.route("**/api/body", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        snapshots: [
          {
            date: today,
            waistCm: {
              value: 90,
              heightCm: null,
              source: "manual",
              recordedAt: today + "T05:00:00Z",
            },
          },
        ],
        today,
        profileHeightCm: null,
        weightTrend: {
          today: null,
          avg7: null,
          avg14: null,
          change: null,
          weeklyRate: null,
          direction: "unknown",
        },
      }),
    }),
  );
  await page.reload();
  await page.getByRole("heading", { name: "Bandingkan dua tanggal" }).waitFor();
  assert.equal(await page.locator("figure").count(), 2);
  assert.equal(
    await page
      .locator("figure")
      .filter({ hasText: "Diagram titik ukur tanpa skala" })
      .count(),
    2,
  );
  await page.unroute("**/api/body");
  const { calibrationFixture } = require("./calibration-fixture.cjs");
  const fixture = calibrationFixture(today);
  function seedCalibration() {
    put("mk:u3:settings", fixture.settings);
    put("mk:u3:weight", fixture.weights);
    for (const log of fixture.logs) put(`mk:u3:day:${log.date}`, log);
  }
  seedCalibration();
  await page.goto(`http://127.0.0.1:${appPort}/progress`);
  await page
    .getByRole("heading", { name: "Usulan penyesuaian bertahap", exact: true })
    .waitFor();
  const apply = page.getByRole("button", {
    name: "Terapkan target 1850 kcal",
    exact: true,
  });
  assert.equal(
    await apply.isDisabled(),
    true,
    "target can apply without context confirmation",
  );
  await page
    .getByRole("button", { name: "Tetap pakai target sekarang", exact: true })
    .click();
  await page
    .getByRole("status")
    .filter({ hasText: "Target 1800 kcal/hari dipertahankan." })
    .waitFor();
  assert.equal(JSON.parse(store.get("mk:u3:settings")).dailyTargetKcal, 1800);
  assert.equal(
    JSON.parse(store.get("mk:u3:settings")).calibrationReview.decision,
    "kept",
  );
  await page
    .getByRole("heading", { name: "Beri pola ini waktu", exact: true })
    .waitFor();
  seedCalibration(); // New synthetic scenario, independent of the keep decision.
  await page.reload();
  await page
    .getByRole("heading", { name: "Usulan penyesuaian bertahap", exact: true })
    .waitFor();
  const confirmation = page.getByRole("checkbox", {
    name: "Saya sudah meninjau catatan dan kondisi serta aktivitas cukup serupa selama periode ini.",
    exact: true,
  });
  await confirmation.check();
  const changed = JSON.parse(store.get(`mk:u3:day:${fixture.dates[0]}`));
  changed.meals[0].calories += 50;
  put(`mk:u3:day:${fixture.dates[0]}`, changed);
  await apply.click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Data atau target berubah" })
    .waitFor();
  assert.equal(
    JSON.parse(store.get("mk:u3:settings")).dailyTargetKcal,
    1800,
    "stale proposal changed target",
  );
  await page
    .getByRole("button", { name: "Muat ulang kalibrasi", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Usulan penyesuaian bertahap", exact: true })
    .waitFor();
  assert.equal(
    await apply.isDisabled(),
    true,
    "confirmation was reused after stale proposal",
  );
  await confirmation.check();
  await page.setViewportSize({ width: 320, height: 720 });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
    "calibration mobile overflow",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("heading", {
      name: "Evaluasi target & estimasi TDEE",
      exact: true,
    })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: path.join(
      projectRoot,
      ".next/validation/progress-calibration-mobile.png",
    ),
    fullPage: true,
  });
  await apply.click();
  await page
    .getByRole("status")
    .filter({ hasText: "Target 1850 kcal/hari diterapkan." })
    .waitFor();
  assert.equal(JSON.parse(store.get("mk:u3:settings")).dailyTargetKcal, 1850);
  assert.equal(JSON.parse(store.get("mk:u3:settings")).proteinTargetG, 120);
  await page
    .getByRole("heading", { name: "Beri pola ini waktu", exact: true })
    .waitFor();
  await page.goto(`http://127.0.0.1:${appPort}/`);
  await page
    .getByText(/\/ 1850 kcal$/)
    .first()
    .waitFor();
  assert.deepEqual(apiErrors, []);
  assert.deepEqual(browserErrors, []);
  console.log(
    "Mobile browser: PASS — third-user login, calibration keep/apply/context/stale proposal/cooldown/Home target, Body Response 14/28/56-day selection, response failure/retry without stale data, mobile table, overview/body, comparison, no overflow, avatar preference, partial correction, deletion, legacy link, keyboard navigation, Fitness/Weekly regression, API failure/retry, empty/missing-height states, 320px/mobile/desktop layout.",
  );
  console.log(
    "Synthetic Redis REST test adapter used; real Upstash/Gemini access not tested.",
  );
})()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (child) child.kill("SIGTERM");
    backend.close();
  });
