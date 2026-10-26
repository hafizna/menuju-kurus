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
const browserConsoleErrors = [];
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
        const count = Number(command[2]);
        const evalKeys = command.slice(3, 3 + count);
        const args = command.slice(3 + count);
        const unchanged = evalKeys.every((evalKey, i) => require("node:util").isDeepStrictEqual(
          store.has(evalKey) ? JSON.parse(store.get(evalKey)) : null,
          JSON.parse(args[i]),
        ));
        if (!unchanged) result = 0;
        else { evalKeys.forEach((evalKey, i) => store.set(evalKey, args[count + i])); result = 1; }
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
        USER1_INVITE_CODE: "",
        USER2_INVITE_CODE: "",
        USER3_INVITE_CODE: "test-invite-code-3",
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
  page.setDefaultTimeout(15_000);
  const base = `http://127.0.0.1:${appPort}`;
  const allowDraftNavigation = async (action) => {
    const accept = (dialog) => dialog.accept();
    page.on("dialog", accept);
    try { await action(); } finally { page.off("dialog", accept); }
  };
  const openAnalysis = async (days) => {
    await page.locator("summary").filter({ hasText: `Lihat analisis dan grafik ${days} hari` }).click();
  };
  const openCalibration = async () => {
    await page.locator("summary").filter({ hasText: "Evaluasi target · periode terpisah 28 hari" }).click();
  };
  page.on("pageerror", (error) => browserErrors.push(error.message));
  page.on("console", (message) => { if (message.type() === "error") browserConsoleErrors.push(message.text()); });
  await page.goto(`http://127.0.0.1:${appPort}/login`);
  await page.getByRole("button", { name: "Masuk dengan PIN", exact: true }).click();
  await page.locator("input[type=password]").fill(testPin);
  await page.getByRole("button", { name: "Masuk", exact: true }).click();
  await page.waitForURL(`http://127.0.0.1:${appPort}/`);
  await page.getByText(/\/ 1800 kcal$/).first().waitFor();
  await fs.mkdir(path.join(projectRoot, ".next/validation"), { recursive: true });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Home mobile overflow");
  await page.screenshot({ path: path.join(projectRoot, ".next/validation/home-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Home desktop overflow");
  await page.screenshot({ path: path.join(projectRoot, ".next/validation/home-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });

  // A draft survives the recommendation mode, other meal routes and a reload.
  await page.goto(`${base}/makan`);
  await page.getByRole("button", { name: "Tulis manual", exact: true }).click();
  await page.getByRole("textbox", { name: "Nama makanan", exact: true }).fill("Draft makan uji");
  await page.getByRole("textbox", { name: "Kalori (kcal)", exact: true }).fill("325");
  await page.getByRole("textbox", { name: "Protein (g)", exact: true }).fill("18");
  await page.getByRole("link", { name: "Ide makan", exact: true }).click();
  await page.getByRole("link", { name: "Catat", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "Nama makanan", exact: true }).inputValue(), "Draft makan uji");
  await page.getByRole("link", { name: "Yang sering →", exact: true }).click();
  await page.getByText("Kesiapan data", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Catat", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "Kalori (kcal)", exact: true }).inputValue(), "325");
  await allowDraftNavigation(() => page.reload());
  await page.getByRole("textbox", { name: "Nama makanan", exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Protein (g)", exact: true }).inputValue(), "18");
  assert.equal(await page.locator('input[type="time"]').first().inputValue().then(Boolean), true);

  await page.route("**/api/log", (route) => route.request().method() === "POST"
    ? route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Simulasi simpan gagal; coba lagi."}' })
    : route.continue());
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Simulasi simpan gagal" }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Nama makanan", exact: true }).inputValue(), "Draft makan uji", "failed save lost draft");
  await page.unroute("**/api/log");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Tersimpan: Draft makan uji" }).waitFor();
  assert.equal(JSON.parse(store.get(`mk:u3:day:${today}`)).meals.filter((meal) => meal.foodName === "Draft makan uji").length, 1);
  assert.equal(JSON.parse(store.get(`mk:u3:day:${today}`)).foodLogComplete, false, "saving food did not reopen complete day");
  await page.route("**/api/log?*", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Simulasi batalkan gagal."}' }));
  await page.getByRole("button", { name: "Batalkan", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Simulasi batalkan gagal" }).waitFor();
  await page.getByRole("status").filter({ hasText: "Tersimpan: Draft makan uji" }).waitFor();
  await page.unroute("**/api/log?*");
  await page.getByRole("button", { name: "Batalkan", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Tersimpan: Draft makan uji" }).waitFor({ state: "hidden" });
  assert.equal(JSON.parse(store.get(`mk:u3:day:${today}`)).meals.some((meal) => meal.foodName === "Draft makan uji"), false, "undo did not remove saved meal");

  // Recent choices require a portion/time check and support undo.
  const quickChoice = page.getByRole("button").filter({ hasText: "Catatan uji" }).filter({ hasText: "Terakhir dicatat" });
  await quickChoice.click();
  await page.getByRole("spinbutton", { name: "Jumlah porsi", exact: true }).fill("0.5");
  await page.getByRole("button", { name: "Tambahkan ke hari ini", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Tersimpan: Catatan uji · 900 kcal" }).waitFor();
  const added = JSON.parse(store.get(`mk:u3:day:${today}`)).meals.find((meal) => meal.id !== "meal-0" && meal.foodName === "Catatan uji");
  assert.equal(added.protein_g, 60);
  assert.ok(Number.isFinite(Date.parse(added.time)), "quick meal has no reviewed time");
  await page.getByRole("button", { name: "Batalkan", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Tersimpan:" }).waitFor({ state: "hidden" });

  // While A is pending, choosing/editing B is blocked; a route remount observes
  // the same in-flight lock and receives confirmation without logging twice.
  await page.locator("summary").filter({ hasText: "Cemilan & minuman" }).click();
  await page.getByRole("button", { name: /^Teh manis / }).click();
  let releaseQuick;
  const heldQuick = new Promise((resolve) => { releaseQuick = resolve; });
  let quickRequests = 0;
  await page.route("**/api/log", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    quickRequests++;
    await heldQuick;
    const response = await route.fetch();
    await route.fulfill({ response });
  });
  await page.getByRole("button", { name: "Tambahkan ke hari ini", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Draft dikunci" }).waitFor();
  assert.equal(await page.getByRole("button", { name: /^Kopi susu / }).isDisabled(), true, "another quick choice remained editable while saving");
  assert.equal(await page.getByRole("spinbutton", { name: "Jumlah porsi", exact: true }).isDisabled(), true, "portion remained editable while saving");
  await page.getByRole("link", { name: "Sering", exact: true }).click();
  await page.getByText("Kesiapan data", { exact: true }).waitFor();
  await page.getByRole("link", { name: "Catat", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Draft dikunci" }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Tambahkan ke hari ini", exact: true }).isDisabled(), true, "pending request became resubmittable after navigation");
  releaseQuick();
  await page.getByRole("status").filter({ hasText: "Tersimpan: Teh manis" }).waitFor();
  assert.equal(quickRequests, 1, "pending meal was submitted more than once");
  assert.equal(JSON.parse(store.get(`mk:u3:day:${today}`)).meals.filter((meal) => meal.foodName === "Teh manis").length, 1);
  await page.unroute("**/api/log");
  await page.getByRole("button", { name: "Batalkan", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Tersimpan:" }).waitFor({ state: "hidden" });

  // Synthetic photo analysis isolates UI corrections from external AI availability.
  const photoAnalysis = {
    foodName: "Nasi telur uji", calories: 480, protein_g: 17, carbs_g: 59, fat_g: 17,
    portionNote: "1 piring", confidence: "medium", kcalLow: 400, kcalHigh: 600,
    components: [
      { name: "Nasi uji", role: "staple", grams: 200, calories: 260, protein_g: 5, carbs_g: 57, fat_g: 1 },
      { name: "Telur uji", role: "other", grams: 80, calories: 120, protein_g: 12, carbs_g: 2, fat_g: 6 },
      { name: "Minyak uji", role: "oil_sauce", grams: 10, calories: 100, protein_g: 0, carbs_g: 0, fat_g: 10 },
    ],
  };
  await page.route("**/api/analyze-food", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ analysis: photoAnalysis }) }));
  await page.locator('input[type="file"]').last().setInputFiles({ name: "synthetic.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j0hQAAAAASUVORK5CYII=", "base64") });
  await page.getByRole("textbox", { name: "Nama makanan", exact: true }).waitFor();
  await page.getByRole("button", { name: "Tambah Nasi uji", exact: true }).click();
  await page.getByRole("radio", { name: "Sedikit", exact: true }).click();
  await page.getByRole("radio", { name: "½", exact: true }).click();
  const correctedCard = page.locator("section").filter({ has: page.locator("#meal-name") });
  assert.equal(await page.getByRole("textbox", { name: "Kalori", exact: true }).inputValue(), "248");
  assert.ok((await correctedCard.locator("ul").innerText()).includes("163 kcal"), "rice detail did not follow correction");
  await page.getByRole("textbox", { name: "Kalori", exact: true }).fill("300");
  await page.getByText("Kalori memakai angka yang kamu isi.", { exact: false }).waitFor();
  assert.equal(await page.getByText(/Perkiraan kasar, bisa sekitar/).count(), 0, "old calorie range remained after manual override");
  await page.getByRole("link", { name: "Sering", exact: true }).click();
  await page.getByRole("link", { name: "Catat", exact: true }).click();
  assert.equal(await page.getByRole("textbox", { name: "Kalori", exact: true }).inputValue(), "300");
  await allowDraftNavigation(() => page.reload());
  await page.getByRole("textbox", { name: "Kalori", exact: true }).waitFor();
  assert.equal(await page.getByRole("radio", { name: "½", exact: true }).getAttribute("aria-checked"), "true");
  assert.equal(await page.getByRole("textbox", { name: "Kalori", exact: true }).inputValue(), "300");
  const persistedDraft = await page.evaluate(() => Object.entries(sessionStorage).find(([key]) => key.startsWith("slothly:meal-draft:v1:u3:"))?.[1]);
  assert.ok(persistedDraft && !persistedDraft.includes("data:image") && !persistedDraft.includes("blob:"), "photo bytes persisted in draft storage");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Buang draft", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Kalori", exact: true }).waitFor({ state: "hidden" });
  await page.unroute("**/api/analyze-food");

  await page.route("**/api/today", (route) => route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Simulasi riwayat gagal."}' }));
  await page.reload();
  await page.getByRole("alert").filter({ hasText: "Simulasi riwayat gagal" }).waitFor();
  await page.unroute("**/api/today");
  await page.getByRole("button", { name: "Coba muat lagi", exact: true }).click();
  await page.getByRole("button", { name: "Foto sekarang", exact: true }).waitFor();
  assert.equal((await page.locator("#riwayat").innerText()).includes("Invalid Date"), false, "legacy history times rendered Invalid Date");
  assert.ok((await page.locator("#riwayat").innerText()).includes("12:00"), "legacy meal time was not preserved");
  assert.ok((await page.locator("#riwayat").innerText()).includes("18:00"), "legacy activity time was not preserved");
  await page.screenshot({ path: path.join(projectRoot, ".next/validation/meal-mobile.png"), fullPage: true });

  // A midnight refresh cannot change the draft's day. After reload, recovery is
  // offered only by an explicit action; the confirmed save targets the old day.
  await page.getByRole("button", { name: "Tulis manual", exact: true }).click();
  await page.getByRole("textbox", { name: "Nama makanan", exact: true }).fill("Draft sebelum tengah malam");
  await page.getByRole("textbox", { name: "Kalori (kcal)", exact: true }).fill("222");
  await page.locator('input[type="time"]').first().fill("00:00");
  const todaySnapshot = await page.evaluate(async () => {
    const response = await fetch("/api/today");
    return { status: response.status, data: await response.json() };
  });
  assert.equal(todaySnapshot.status, 200, "authenticated browser could not read today's fixture");
  const actualToday = todaySnapshot.data;
  assert.equal(actualToday.settings?.timezone, "Asia/Jakarta", "midnight fixture has no account timezone");
  assert.equal(actualToday.userId, "u3", "midnight fixture has no authenticated user scope");
  const tomorrow = new Date(Date.parse(today) + 86400000).toISOString().slice(0, 10);
  await page.clock.install({ time: new Date(`${tomorrow}T00:10:00+07:00`) });
  await page.route("**/api/today", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...actualToday, date: tomorrow, log: { date: tomorrow, meals: [], burns: [] } }) }));
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await page.getByRole("button", { name: `Lanjutkan draft ${today}`, exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Nama makanan", exact: true }).inputValue(), "Draft sebelum tengah malam");
  assert.equal(await page.getByRole("textbox", { name: "Nama makanan", exact: true }).isDisabled(), true, "old draft was editable before its date was reviewed");
  await allowDraftNavigation(() => page.reload());
  await page.getByRole("button", { name: `Lanjutkan draft ${today}`, exact: true }).click();
  await page.getByRole("textbox", { name: "Nama makanan", exact: true }).waitFor();
  assert.equal(await page.getByRole("textbox", { name: "Nama makanan", exact: true }).inputValue(), "Draft sebelum tengah malam", "prior draft could not be recovered after reload");
  assert.equal(await page.getByRole("textbox", { name: "Nama makanan", exact: true }).isEnabled(), true);
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Tersimpan: Draft sebelum tengah malam" }).waitFor();
  assert.equal(JSON.parse(store.get(`mk:u3:day:${today}`)).meals.filter((meal) => meal.foodName === "Draft sebelum tengah malam").length, 1);
  assert.equal(store.has(`mk:u3:day:${tomorrow}`), false, "recovered draft was silently migrated to the new day");
  await page.getByRole("button", { name: "Batalkan", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Tersimpan:" }).waitFor({ state: "hidden" });
  await page.unroute("**/api/today");
  await page.clock.setSystemTime(new Date());
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
  await openAnalysis(28);
  await page
    .getByRole("heading", { name: "Body Response · 28 hari", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "14 hari", exact: true }).click();
  await openAnalysis(14);
  await page
    .getByRole("heading", { name: "Body Response · 14 hari", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "56 hari", exact: true }).click();
  await openAnalysis(56);
  await page
    .getByRole("heading", { name: "Body Response · 56 hari", exact: true })
    .waitFor();
  await page.getByRole("button", { name: "28 hari", exact: true }).click();
  await openAnalysis(28);
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
  await openAnalysis(14);
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
  await openAnalysis(28);
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
  await page.getByText("Review 7 hari terakhir", { exact: true }).waitFor();
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
  await openCalibration();
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
  await openCalibration();
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

  // The explicit animation preference persists and the OS preference wins in auto mode.
  await page.goto(`${base}/settings`);
  const storedBeforePreview = JSON.parse(store.get("mk:u3:settings"));
  await page.getByRole("spinbutton", { name: "Tinggi badan", exact: true }).fill("300");
  await page.getByRole("button", { name: "Lihat rekomendasi dari isian ini", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Isi tinggi 120–230 cm." }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Gunakan rekomendasi", exact: true }).count(), 0, "invalid height still allowed applying recommendation");
  assert.deepEqual(JSON.parse(store.get("mk:u3:settings")), storedBeforePreview, "viewing invalid preview changed active settings");
  await page.getByRole("spinbutton", { name: "Tinggi badan", exact: true }).fill("170");
  await page.getByRole("button", { name: "Lihat rekomendasi dari isian ini", exact: true }).click();
  await page.getByRole("button", { name: "Gunakan rekomendasi", exact: true }).waitFor();
  assert.deepEqual(JSON.parse(store.get("mk:u3:settings")), storedBeforePreview, "viewing valid preview changed active settings");
  const reduceMotion = page.getByRole("checkbox", { name: /^Kurangi animasi/ });
  await reduceMotion.check();
  assert.equal(await page.locator("html").getAttribute("data-motion"), "off");
  await page.reload();
  await reduceMotion.waitFor();
  assert.equal(await reduceMotion.isChecked(), true, "animation setting did not survive reload");
  await page.goto(`${base}/`);
  await page.locator(".kukang-motion").first().waitFor({ state: "attached" });
  assert.equal(await page.locator(".kukang-motion").evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).animationName === "none")), true, "motion setting did not stop mascot animations");
  await page.goto(`${base}/settings`);
  await reduceMotion.uncheck();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(`${base}/`);
  await page.locator(".kukang-motion").first().waitFor({ state: "attached" });
  assert.equal(await page.locator(".kukang-motion").evaluateAll((nodes) => nodes.every((node) => getComputedStyle(node).animationName === "none")), true, "device reduced-motion was ignored");
  await page.emulateMedia({ reducedMotion: "no-preference" });

  // A name is optional; an athletic goal does not request a weight-loss target.
  await page.goto(`${base}/onboarding`);
  const nickname = page.getByRole("textbox", { name: /Biar akrab/ });
  await nickname.waitFor();
  await nickname.fill("");
  await page.getByRole("button", { name: "Mulai", exact: true }).click();
  await page.getByRole("heading", { name: "Apa tujuan utamamu?", exact: true }).waitFor();
  await page.getByRole("button", { name: /Jaga bentuk badan dan performa/ }).click();
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Pilih jenis kelamin biologis" }).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Data tubuhmu", exact: true }).isVisible(), true, "invalid body details advanced onboarding");
  assert.equal(await page.getByRole("textbox", { name: "Berat target", exact: true }).count(), 0, "athletic onboarding asks for weight-loss target");
  await page.getByRole("button", { name: "Laki-laki", exact: true }).click();
  await page.getByPlaceholder("tahun", { exact: true }).fill("17");
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.getByText("Isi usia 18–100 tahun.", { exact: true }).waitFor();
  await page.getByPlaceholder("tahun", { exact: true }).fill("30");
  await page.getByPlaceholder("cm", { exact: true }).fill("170");
  await page.getByPlaceholder("kg", { exact: true }).fill("77");
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.getByRole("button", { name: /^Ringan/ }).click();
  await page.getByRole("button", { name: "Lanjut", exact: true }).click();
  await page.getByRole("heading", { name: "Ini titik awalmu", exact: true }).waitFor();
  await page.getByRole("button", { name: "Pakai target ini dan catat makan", exact: true }).click();
  await page.waitForURL(`${base}/makan`);
  assert.equal(JSON.parse(store.get("mk:u3:settings")).displayName, null, "optional blank name was not preserved");
  assert.equal(JSON.parse(store.get("mk:u3:settings")).fitnessGoal, "athletic");

  // A real receipt, rather than opening the Shortcut or testing its token,
  // marks Health as synced. The browser never reads device health data.
  for (const method of ["GET", "POST", "DELETE"]) {
    const denied = await fetch(`${base}/api/health-connection`, { method });
    assert.equal(denied.status, 401, `unauthenticated Health management ${method} was allowed`);
  }
  const shortcutDownload = await fetch(`${base}/shortcuts/slothly-health-sync.shortcut`);
  assert.equal(shortcutDownload.status, 200, "Shortcuts cannot download the generic artifact without a browser session");
  const shortcutBytes = Buffer.from(await shortcutDownload.arrayBuffer());
  assert.equal(shortcutBytes.subarray(0, 4).toString("ascii"), "AEA1", "Shortcut download is not a signed Apple archive");
  const readCheckDownload = await fetch(`${base}/shortcuts/slothly-health-read-check.shortcut?v=1`);
  assert.equal(readCheckDownload.status, 200, "Health read check cannot be downloaded without a browser session");
  assert.match(readCheckDownload.headers.get("content-disposition"), /slothly-health-read-check\.shortcut/, "Health read check download lost its installable filename");
  assert.equal(Buffer.from(await readCheckDownload.arrayBuffer()).subarray(0, 4).toString("ascii"), "AEA1", "Health read check is not a signed Apple archive");

  await page.goto(`${base}/settings`);
  await page.getByRole("link", { name: "Hubungkan Apple Health →", exact: true }).click();
  await page.waitForURL(`${base}/settings/health`);
  await page.getByRole("heading", { name: "Hubungkan Apple Health", exact: true }).waitFor();
  await page.getByRole("heading", { name: "Gunakan Shortcut versi 5", exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Unduh Shortcut terbaru", exact: true }).getAttribute("href"), "/shortcuts/slothly-health-sync.shortcut?v=5", "download link still serves the cached query version");
  await page.getByRole("heading", { name: "Belum terhubung", exact: true }).waitFor();
  const readCheckHelp = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: "Data ada di Health, tetapi belum terbaca?" }) });
  await readCheckHelp.locator("summary").click();
  assert.equal(await readCheckHelp.getByRole("link", { name: "Unduh pemeriksaan Health", exact: true }).getAttribute("href"), "/shortcuts/slothly-health-read-check.shortcut?v=1");
  await readCheckHelp.locator("summary").click();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { window.__healthClipboard = text; } },
    });
  });
  const createHealthResponse = page.waitForResponse((response) =>
    response.url() === `${base}/api/health-connection` && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Siapkan koneksi", exact: true }).click();
  const createdHealthResponse = await createHealthResponse;
  assert.equal(createdHealthResponse.status(), 200, "Health connection creation failed");
  const healthCreated = await createdHealthResponse.json();
  let healthToken = healthCreated.token;
  assert.ok(typeof healthToken === "string" && healthToken.length > 40, "Health setup did not issue a private credential");
  await page.getByRole("heading", { name: "Selesaikan pemasangan", exact: true }).waitFor();
  const expectNoHealthSecret = async (...tokens) => {
    const exposed = await page.evaluate((secrets) => {
      const rendered = document.body.textContent || "";
      const persisted = JSON.stringify([Object.entries(localStorage), Object.entries(sessionStorage)]);
      return secrets.some((secret) => rendered.includes(secret) || persisted.includes(secret));
    }, tokens);
    assert.equal(exposed, false, "a Health credential leaked into rendered text or browser storage");
    assert.equal([...store.values()].some((value) => tokens.some((token) => value.includes(token))), false, "raw Health credential persisted in the database");
  };
  await expectNoHealthSecret(healthToken);

  // Hand-built Shortcuts need the bare token for the Authorization header, not the JSON configuration.
  await page.getByRole("heading", { name: "Buat Shortcut sendiri (±5 menit)", exact: true }).waitFor();
  await page.getByRole("button", { name: "Salin token saja", exact: true }).click();
  await page.getByRole("button", { name: "Token disalin ✓", exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__healthClipboard), healthToken, "the bare token was not copied");
  await page.evaluate(() => { window.__healthClipboard = undefined; });
  await expectNoHealthSecret(healthToken);

  const manualConfiguration = page.getByRole("textbox", { name: "Konfigurasi koneksi pribadi", exact: true });
  const openShortcutLink = page.getByRole("link", { name: "Buka Shortcut", exact: true });
  const shortcutNameInput = page.getByRole("textbox", { name: "Nama Shortcut di iPhone", exact: true });
  assert.equal(await shortcutNameInput.inputValue(), "slothly-health-sync", "default Shortcut name does not match the installed filename");
  await page.getByRole("button", { name: "Salin manual", exact: true }).click();
  await manualConfiguration.waitFor();
  const initialManualConfiguration = JSON.parse(await manualConfiguration.inputValue());
  assert.equal(initialManualConfiguration.token, healthToken, "manual configuration did not contain the current connection");
  assert.equal(initialManualConfiguration.endpoint, `${base}/api/health-sync`);
  assert.equal(await openShortcutLink.count(), 0, "showing a configuration falsely marked it copied");

  // An issued token is not proof that the iPhone saved its configuration.
  // After leaving setup, offer a visible recovery action instead of waiting.
  await page.reload();
  await page.getByRole("heading", { name: "Selesaikan pemasangan", exact: true }).waitFor();
  assert.equal(await page.getByRole("link", { name: "Sinkronkan sekarang", exact: true }).count(), 0, "untested connection skipped required setup");
  const resumeSetup = page.waitForResponse((response) => response.url() === `${base}/api/health-connection` && response.request().method() === "POST");
  await page.getByRole("button", { name: "Lengkapi pemasangan", exact: true }).click();
  healthToken = (await (await resumeSetup).json()).token;
  await page.getByRole("button", { name: "Salin konfigurasi", exact: true }).waitFor();

  const reconnectForClipboardTest = async () => {
    const management = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: "Kelola koneksi" }) });
    if (!(await management.evaluate((details) => details.open))) await management.locator("summary").click();
    const response = page.waitForResponse((result) =>
      result.url() === `${base}/api/health-connection` && result.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Sambungkan ulang", exact: true }).click();
    const nextConnectionResponse = await response;
    assert.equal(nextConnectionResponse.status(), 200, "could not replace the Health connection for clipboard recovery");
    const nextConnection = await nextConnectionResponse.json();
    assert.ok(nextConnection.token && nextConnection.token !== healthToken, "reconnecting did not replace the configuration");
    await page.getByRole("button", { name: "Salin konfigurasi", exact: true }).waitFor();
    await page.getByRole("button", { name: "Salin konfigurasi lebih dulu", exact: true }).waitFor();
    healthToken = nextConnection.token;
  };

  await reconnectForClipboardTest();
  assert.equal(await manualConfiguration.count(), 0, "reconnecting exposed the new private configuration before manual copy was requested");
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => { throw new DOMException("Clipboard denied by browser", "NotAllowedError"); };
  });
  await page.getByRole("button", { name: "Salin konfigurasi", exact: true }).click();
  await manualConfiguration.waitFor();
  assert.equal(await openShortcutLink.count(), 0, "denied clipboard access falsely marked the configuration copied");
  await page.getByRole("button", { name: "Pilih teks", exact: true }).click();
  assert.equal(await manualConfiguration.evaluate((field) => field.selectionStart === 0 && field.selectionEnd === field.value.length), true, "manual configuration cannot be selected in full");
  await page.getByRole("button", { name: "Sudah saya salin", exact: true }).click();
  await openShortcutLink.waitFor();

  await reconnectForClipboardTest();
  await page.evaluate(() => {
    navigator.clipboard.writeText = (text) => new Promise((resolve) => {
      window.__resolveDelayedHealthClipboard = () => { window.__healthClipboard = text; resolve(); };
    });
  });
  const clipboardHangStarted = Date.now();
  await page.getByRole("button", { name: "Salin konfigurasi", exact: true }).click();
  await manualConfiguration.waitFor({ timeout: 4500 });
  assert.ok(Date.now() - clipboardHangStarted < 4500, "a hanging Clipboard API left setup without a timely recovery");
  assert.equal(JSON.parse(await manualConfiguration.inputValue()).token, healthToken, "clipboard recovery showed an outdated connection");
  assert.equal(await openShortcutLink.count(), 0, "a hanging Clipboard API falsely marked the configuration copied");
  await page.getByRole("button", { name: "Pilih teks", exact: true }).click();
  await page.getByRole("button", { name: "Sudah saya salin", exact: true }).click();
  await openShortcutLink.waitFor();

  await reconnectForClipboardTest();
  await page.evaluate(async () => {
    window.__resolveDelayedHealthClipboard();
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  });
  assert.equal(await openShortcutLink.count(), 0, "a late clipboard result unlocked a different connection");
  assert.equal(await page.getByRole("button", { name: "Salin konfigurasi lebih dulu", exact: true }).isDisabled(), true);
  await expectNoHealthSecret(healthToken);
  await page.evaluate(() => {
    navigator.clipboard.writeText = async (text) => { window.__healthClipboard = text; };
  });
  await page.getByRole("button", { name: "Salin konfigurasi", exact: true }).click();
  await page.getByRole("button", { name: "Disalin ✓", exact: true }).waitFor();
  const copiedHealthConfiguration = await page.evaluate(() => JSON.parse(window.__healthClipboard));
  assert.equal(copiedHealthConfiguration.endpoint, `${base}/api/health-sync`);
  assert.ok(copiedHealthConfiguration.token === healthToken, "copied configuration did not match the fresh connection");
  const shortcutLink = await page.getByRole("link", { name: "Buka Shortcut", exact: true }).getAttribute("href");
  assert.ok(shortcutLink.startsWith("shortcuts://run-shortcut?") && shortcutLink.includes("input=clipboard"), "setup cannot pass the configuration to Shortcuts");
  assert.equal(new URL(shortcutLink).searchParams.get("name"), "slothly-health-sync", "handoff cannot find the installed Shortcut name");
  assert.equal(shortcutLink.includes(healthToken), false, "Health credential was exposed in a URL");
  const customShortcutName = "Slothly Health Sync Hafizna";
  await shortcutNameInput.fill(customShortcutName);
  const customShortcutLink = await openShortcutLink.getAttribute("href");
  assert.equal(new URL(customShortcutLink).searchParams.get("name"), customShortcutName, "renaming the installed Shortcut does not update handoff");
  assert.equal(customShortcutLink.includes(healthToken), false, "custom Shortcut name exposed the Health credential in a URL");
  await page.setViewportSize({ width: 320, height: 720 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Shortcut installation steps overflow at 320px");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(projectRoot, ".next/validation/health-setup-mobile.png"), fullPage: true });

  const beforeHealthTestWeights = store.get("mk:u3:weight");
  const beforeHealthTestBody = store.get("mk:u3:body");
  const testHealthResponse = await fetch(`${base}/api/health-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${healthToken}` },
    body: JSON.stringify({ test: true, provider: "apple_health" }),
  });
  assert.equal(testHealthResponse.status, 200);
  assert.equal((await testHealthResponse.json()).tested, true);
  await page.getByRole("button", { name: "Periksa status", exact: true }).click();
  await page.getByText(/^Koneksi diuji:/).waitFor();
  assert.equal(await page.getByRole("heading", { name: "Koneksi diuji, data belum masuk", exact: true }).isVisible(), true, "connection test falsely claimed a measurement arrived");
  assert.equal(store.get("mk:u3:weight"), beforeHealthTestWeights, "connection test changed weight history");
  assert.equal(store.get("mk:u3:body"), beforeHealthTestBody, "connection test changed body history");

  // Historical samples are separate readings. UTC timestamps are assigned to
  // the user's timezone, so this weight belongs to the following Jakarta day.
  const importedWeightTime = `${offset(250)}T23:45:00.000Z`;
  const importedWeightDate = offset(249);
  const importedFatTime = `${offset(247)}T01:00:00.000Z`;
  const importedFatDate = offset(247);
  const healthSamples = {
    provider: "apple_health",
    samples: [
      { metric: "weightKg", value: 90.2, measuredAt: importedWeightTime },
      { metric: "bodyFatPercent", value: 30.3, measuredAt: importedFatTime },
    ],
  };
  const sendHealthSamples = () => fetch(`${base}/api/health-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${healthToken}` },
    body: JSON.stringify(healthSamples),
  });
  const importedHealthResponse = await sendHealthSamples();
  assert.equal(importedHealthResponse.status, 200);
  assert.equal((await importedHealthResponse.json()).received, 2);
  const importedWeight = JSON.parse(store.get("mk:u3:weight")).find((entry) => entry.date === importedWeightDate);
  assert.equal(importedWeight.weightKg, 90.2);
  assert.equal(importedWeight.source, "shortcuts");
  assert.equal(importedWeight.createdAt, importedWeightTime, "import replaced the original measurement time with today");
  const importedFat = JSON.parse(store.get("mk:u3:body")).find((entry) => entry.date === importedFatDate).bodyFatPercent;
  assert.equal(importedFat.value, 30.3);
  assert.equal(importedFat.recordedAt, importedFatTime);
  assert.equal((await sendHealthSamples()).status, 200);
  assert.equal(JSON.parse(store.get("mk:u3:weight")).filter((entry) => entry.date === importedWeightDate).length, 1, "retry duplicated a Health weight sample");
  await page.getByRole("button", { name: "Periksa status", exact: true }).click();
  await page.getByRole("heading", { name: "Data sudah diterima", exact: true }).waitFor();
  await page.getByText("Persentase lemak, Berat badan", { exact: true }).waitFor();
  const healthStatus = await page.evaluate(async () => {
    const response = await fetch("/api/health-connection");
    if (!response.ok) throw new Error("Could not read authenticated Health status");
    return response.json();
  });
  assert.deepEqual(healthStatus.lastSync.dates, [importedWeightDate, importedFatDate].sort());
  assert.equal(healthStatus.token, undefined, "status API returned a reusable credential");
  const importedBody = await page.evaluate(async () => {
    const response = await fetch("/api/body");
    if (!response.ok) throw new Error("Could not read authenticated body history");
    return response.json();
  });
  assert.equal(importedBody.snapshots.find((entry) => entry.date === importedWeightDate).weightKg.value, 90.2, "Health weight missing from shared body history");
  assert.equal(importedBody.snapshots.find((entry) => entry.date === importedFatDate).bodyFatPercent.value, 30.3, "Health body fat missing from shared body history");

  const beforeFitnessImportSettings = store.get("mk:u3:settings");
  const importedFitnessResponse = await fetch(`${base}/api/health-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${healthToken}` },
    body: JSON.stringify({ provider: "apple_health", samples: [
      { metric: "vo2Max", value: 44.2, measuredAt: `${offset(45)}T02:30:00.000Z` },
      { metric: "restingHeartRate", value: 58, measuredAt: `${offset(3)}T04:00:00.000Z` },
    ] }),
  });
  assert.equal(importedFitnessResponse.status, 200);
  assert.equal((await importedFitnessResponse.json()).received, 2);
  assert.equal(store.get("mk:u3:settings"), beforeFitnessImportSettings, "fitness import overwrote editable profile settings");
  await page.goto(`${base}/progress?tab=fitness`);
  await page.getByText("44.2 mL/kg/min", { exact: true }).waitFor();
  await page.getByText("58 bpm", { exact: true }).waitFor();
  assert.equal(await page.getByText(/^Apple Health ·/).count(), 2, "imported fitness readings omitted source and original dates");
  await page.setViewportSize({ width: 320, height: 720 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "fitness units overflow at 320px");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(projectRoot, ".next/validation/health-fitness-mobile.png"), fullPage: true });
  await page.goto(`${base}/settings/health`);
  await page.reload();
  await page.getByRole("heading", { name: "Data sudah diterima", exact: true }).waitFor();
  assert.equal(await shortcutNameInput.inputValue(), customShortcutName, "the installed Shortcut name was forgotten on reload");
  const syncShortcutLink = await page.getByRole("link", { name: "Sinkronkan sekarang", exact: true }).getAttribute("href");
  assert.equal(new URL(syncShortcutLink).searchParams.get("name"), customShortcutName, "subsequent sync uses a different Shortcut name");
  await expectNoHealthSecret(healthToken);
  assert.equal(await page.getByRole("button", { name: "Salin konfigurasi", exact: true }).count(), 0, "reload recovered a credential that should exist only in memory");
  await page.setViewportSize({ width: 320, height: 720 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Health setup mobile overflow");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => { localStorage.setItem("mk_theme", "light"); window.dispatchEvent(new Event("mk-theme")); });
  await page.waitForFunction(() => !document.documentElement.classList.contains("dark"));
  await page.screenshot({ path: path.join(projectRoot, ".next/validation/health-connection-mobile.png"), fullPage: true });
  await page.evaluate(() => { localStorage.setItem("mk_theme", "dark"); window.dispatchEvent(new Event("mk-theme")); });
  await page.waitForFunction(() => document.documentElement.classList.contains("dark"));
  await page.screenshot({ path: path.join(projectRoot, ".next/validation/health-connection-dark.png"), fullPage: true });
  await page.evaluate(() => { localStorage.setItem("mk_theme", "light"); window.dispatchEvent(new Event("mk-theme")); });

  await page.locator("summary").filter({ hasText: "Kelola koneksi" }).click();
  const rotateHealthResponse = page.waitForResponse((response) =>
    response.url() === `${base}/api/health-connection` && response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Sambungkan ulang", exact: true }).click();
  const rotatedHealth = await (await rotateHealthResponse).json();
  assert.ok(typeof rotatedHealth.token === "string" && rotatedHealth.token !== healthToken, "reconnect reused the old credential");
  await expectNoHealthSecret(healthToken, rotatedHealth.token);
  assert.equal((await sendHealthSamples()).status, 401, "old Health credential still worked after reconnect");
  assert.equal((await fetch(`${base}/api/health-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${rotatedHealth.token}` },
    body: JSON.stringify({ test: true, provider: "apple_health" }),
  })).status, 200, "fresh Health credential could not test the connection");
  await page.getByRole("button", { name: "Putuskan koneksi", exact: true }).click();
  await page.getByRole("heading", { name: "Belum terhubung", exact: true }).waitFor();
  assert.equal((await fetch(`${base}/api/health-sync`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${rotatedHealth.token}` },
    body: JSON.stringify({ test: true, provider: "apple_health" }),
  })).status, 401, "revoked Health credential could still submit");
  assert.equal(JSON.parse(store.get("mk:u3:weight")).find((entry) => entry.date === importedWeightDate).weightKg, 90.2, "disconnect deleted imported history");
  assert.deepEqual(apiErrors, []);
  assert.deepEqual(browserErrors, []);
  console.log(
    "Browser: PASS — third-user login, Rumah Kukang mobile/desktop, meal draft across mode/route/reload, photo corrections and override, reviewed recent meal, save/undo failure and retry, today failure/retry, scoped session draft without photos, calibration keep/apply/context/stale proposal/cooldown/Home target, Body Response 14/28/56-day selection and failure/retry, body comparison/check-in/deletion, keyboard navigation, Fitness/Weekly regression, empty/missing-height states, 320px/mobile/desktop layout, persisted motion toggle and OS reduced-motion, optional-name/athletic onboarding validation.",
  );
  console.log(
    "Health connection: PASS — unauthenticated management denied, public signed Shortcut download, private configuration copy, denied/hanging clipboard recovery and manual confirmation, stale clipboard completion after rotation, installed/custom Shortcut name handoff and persistence, test versus receipt status, historical timestamp/timezone preservation, independent weight/body-fat history, retry deduplication, secret-free status/reload/storage, 320px/light/dark layouts, rotation and revocation. Synthetic Redis REST, Clipboard API outcomes, and Health samples used; real Upstash/Gemini/HealthKit/device access not tested.",
  );
})()
  .catch(async (error) => {
    console.error(error.stack || error.message);
    console.error("Browser errors:", JSON.stringify(browserErrors));
    console.error("Browser console:", JSON.stringify(browserConsoleErrors.slice(-12)));
    const failedPage = browser?.contexts()[0]?.pages()[0];
    if (failedPage) {
      await fs.mkdir(path.join(projectRoot, ".next/validation"), { recursive: true });
      await failedPage.screenshot({ path: path.join(projectRoot, ".next/validation/browser-failure.png"), fullPage: true }).catch(() => {});
    }
    process.exitCode = 1;
  })
  .finally(async () => {
    if (browser) await browser.close();
    if (child) child.kill("SIGTERM");
    backend.close();
  });
