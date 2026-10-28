const assert = require("node:assert/strict");
const path = require("node:path");

// Run inside the authenticated smoke-test browser. A meal is written in words
// instead of photographed: the estimate endpoint is faked, the server and
// storage are real. Checks the form, the standard measures, a failed and a
// held request, the review, the saved breakdown, the history and a correction.
const component = (name, role, grams, calories, protein_g, carbs_g, fat_g) => ({ name, role, grams, calories, protein_g, carbs_g, fat_g, sugar_g: 0 });
const analysis = () => {
  const components = [
    component("Nasi putih", "staple", 150, 195, 4, 43, 0),
    component("Telur dadar", "other", 120, 320, 14, 2, 28),
  ];
  const sum = (key) => components.reduce((total, c) => total + c[key], 0);
  const calories = sum("calories");
  return {
    foodName: "Nasi + telur dadar", portionNote: "nasi 1,5 centong, telur dadar 2 butir", confidence: "high",
    kcalLow: Math.round(calories * 0.85), kcalHigh: Math.round(calories * 1.25),
    calories, protein_g: sum("protein_g"), carbs_g: sum("carbs_g"), fat_g: sum("fat_g"), sugar_g: 0, components,
  };
};
const WRITTEN = "nasi 1,5 centong, telur dadar 2 butir";

module.exports = async function verifyDescribe({ page, base, store, today, projectRoot }) {
  const meals = () => JSON.parse(store.get(`mk:u3:day:${today}`)).meals;
  const requests = [];
  let mode = "ok";
  let releaseHeld;
  const held = new Promise((resolve) => { releaseHeld = resolve; });
  await page.route("**/api/estimate-meal", async (route) => {
    requests.push(JSON.parse(route.request().postData()));
    if (mode === "fail") return route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: "Hitung dari tulisan sedang tidak tersedia. Kamu masih bisa mengisi manual." }) });
    if (mode === "hold") await held;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ analysis: analysis() }) });
  });
  const acceptLeave = (dialog) => dialog.accept();
  page.on("dialog", acceptLeave);

  try {
    await page.goto(`${base}/makan`);
    const open = page.getByRole("button", { name: /^Tulis & hitung/ });
    await open.click();
    assert.equal(await open.getAttribute("aria-expanded"), "true");
    const form = page.getByRole("region", { name: "Tulis dan hitung" });
    const text = page.locator("#describe-text");
    const calculate = form.getByRole("button", { name: "Hitung", exact: true });
    assert.equal(await calculate.isDisabled(), true, "Hitung should wait for some text");
    // The form sits right under its button and is brought into view, not left below the fold.
    await page.waitForFunction(() => {
      const top = document.querySelector('[aria-label="Tulis dan hitung"]')?.getBoundingClientRect().top;
      return top !== undefined && top >= 0 && top < innerHeight * 0.5;
    });
    const formTop = await form.evaluate((node) => node.getBoundingClientRect().top + scrollY);
    const repeat = page.getByRole("heading", { name: "Makan yang sama lagi?" });
    assert.equal(await repeat.count(), 1, "the repeat-meals list is part of this test's screen");
    assert.ok(formTop < (await repeat.evaluate((node) => node.getBoundingClientRect().top + scrollY)), "the form opened below the repeat-meals list");

    // 1. The standard measures are in plain view, and the chips write them in.
    await form.locator("summary").filter({ hasText: "Ukuran baku yang dipakai" }).click();
    await form.getByText("1 centong = 100 g matang").waitFor();
    await form.getByText("Kalori satu centong nasi sama untuk siapa saja", { exact: false }).waitFor();
    await form.getByRole("button", { name: "+ nasi 1 centong", exact: true }).click();
    await form.getByRole("button", { name: "+ telur 1 butir", exact: true }).click();
    assert.equal(await text.inputValue(), "nasi 1 centong, telur 1 butir");
    await text.fill(WRITTEN);
    assert.equal(await calculate.isDisabled(), false);

    // 2. A failed estimate keeps the text and points to the manual route.
    mode = "fail";
    await calculate.click();
    await form.getByRole("alert").filter({ hasText: "Kamu masih bisa mengisi manual" }).waitFor();
    assert.equal(await text.inputValue(), WRITTEN, "the written text was lost after a failure");

    // 3. While the estimate is pending, kukang keeps busy; then the usual review appears.
    mode = "hold";
    await calculate.click();
    await form.getByText("Menghitung makananmu...", { exact: true }).waitFor();
    assert.equal(await form.locator(".kukang").count(), 1);
    assert.equal(await text.count(), 0, "the form stayed editable while calculating");
    await page.screenshot({ path: path.join(projectRoot, ".next/validation/describe-calculating.png") });
    releaseHeld();
    await page.getByRole("button", { name: "Tambah Telur dadar", exact: true }).waitFor();
    assert.equal(requests.at(-1).text, WRITTEN);
    assert.equal(Object.keys(requests.at(-1)).join(), "text", "nothing but the text is sent");
    assert.equal(await page.getByAltText("Foto makanan").count(), 0, "there is no photo");
    await page.getByText("Tambahan atau perubahan dari yang kamu tulis", { exact: false }).waitFor();
    const kcal = page.getByRole("textbox", { name: "Kalori", exact: true });
    const protein = page.getByRole("textbox", { name: "Protein", exact: true });
    assert.equal(await kcal.inputValue(), "515");
    assert.equal(await protein.inputValue(), "18");
    assert.equal(await page.getByRole("region", { name: "Tulis dan hitung" }).count(), 0, "the form should give way to the review");
    await page.screenshot({ path: path.join(projectRoot, ".next/validation/describe-review.png"), fullPage: true });

    // 4. The same corrections as for a photo, then save.
    await page.getByRole("button", { name: "Tambah Telur dadar", exact: true }).click();
    assert.equal(await kcal.inputValue(), "675");
    assert.equal(await protein.inputValue(), "25");
    await page.getByRole("button", { name: "Simpan ke catatan hari ini", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Tersimpan: Nasi + telur dadar" }).waitFor();
    const saved = meals().find((meal) => meal.foodName === "Nasi + telur dadar");
    assert.ok(saved, "the meal was not saved");
    assert.equal(saved.source, "manual", "a meal without a photo is not a photo meal");
    assert.equal(saved.calories, 675);
    assert.equal(saved.protein_g, 25);
    assert.equal(saved.breakdown.described, WRITTEN);
    assert.deepEqual(saved.breakdown.adjust.scales, [1, 1.5]);
    assert.equal("note" in saved.breakdown, false);
    assert.equal(await page.locator("#describe-text").count(), 0, "the form came back after saving");

    // 5. The history shows what was written and what it was made of; a correction opens the same review.
    await page.locator('[aria-controls^="detail-"]').filter({ hasText: "Nasi + telur dadar" }).click();
    await page.getByText(`Yang kamu tulis: ${WRITTEN}`, { exact: true }).waitFor();
    await page.getByRole("list", { name: "Rincian bahan" }).waitFor();
    await page.getByRole("button", { name: "Koreksi", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Koreksi makanan" });
    await dialog.getByText("tersimpan sebagai hasil hitung dari tulisan", { exact: false }).waitFor();
    await dialog.getByText(`Yang kamu tulis: ${WRITTEN}`, { exact: true }).waitFor();
    assert.equal(await dialog.getByLabel("Jumlah Telur dadar").innerText(), "×1,5");
    await dialog.getByRole("button", { name: "Batal", exact: true }).click();
    await dialog.waitFor({ state: "detached" });

    // 6. Cleanup of the meal added here.
    await page.getByRole("button", { name: /^Hapus Nasi \+ telur dadar/ }).click();
    for (let i = 0; i < 40 && meals().some((meal) => meal.id === saved.id); i++) await page.waitForTimeout(250);
    assert.equal(meals().some((meal) => meal.id === saved.id), false);

    // 7. Unsent text survives a reload as a draft, and the manual form still works beside it.
    mode = "ok";
    await page.goto(`${base}/makan`);
    await page.getByRole("button", { name: /^Tulis & hitung/ }).click();
    await page.locator("#describe-text").fill("nasi 2 centong");
    await page.reload();
    await page.locator("#describe-text").waitFor();
    assert.equal(await page.locator("#describe-text").inputValue(), "nasi 2 centong", "the unsent text did not come back");
    await page.getByRole("button", { name: "Tulis manual", exact: true }).click();
    await page.getByRole("textbox", { name: "Nama makanan", exact: true }).waitFor();
    assert.equal(await page.locator("#describe-text").count(), 0, "both forms are open at once");
    await page.getByRole("button", { name: /^Tulis & hitung/ }).click();
    assert.equal(await page.locator("#describe-text").inputValue(), "nasi 2 centong", "switching forms lost the text");
    await page.setViewportSize({ width: 320, height: 720 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "describe form overflow at 320px");
    await page.screenshot({ path: path.join(projectRoot, ".next/validation/describe-form-320.png"), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    // Leave no draft behind for the rest of the suite.
    await page.locator("#describe-text").fill("");
    await page.getByRole("button", { name: /^Tulis & hitung/ }).click();
    console.log("Describe meal: PASS — standard measures and quick phrases, failure keeps the text, kukang while calculating, same review as a photo, saved as a manual meal with its breakdown and words, history and correction, draft across reload, 320px layout.");
  } finally {
    page.off("dialog", acceptLeave);
    await page.unroute("**/api/estimate-meal");
  }
};
