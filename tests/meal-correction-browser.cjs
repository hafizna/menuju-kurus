const assert = require("node:assert/strict");

// Run inside the authenticated smoke-test browser. Logs a photo meal with a note
// and a typed protein, opens it from the history, corrects the ingredient
// amounts and recalculates from a note, then corrects a manual meal from
// yesterday. The AI endpoints are faked; the server and storage are real.
const JPEG = Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64");

const component = (name, role, grams, calories, protein_g, carbs_g, fat_g) => ({ name, role, grams, calories, protein_g, carbs_g, fat_g, sugar_g: 0 });
const analysis = (egg) => {
  const components = [
    component("Nasi putih", "staple", 150, 195, 4, 43, 0),
    component("Minyak goreng", "oil_sauce", 10, 90, 0, 0, 10),
    egg,
    component("Timun", "other", 30, 5, 0, 1, 0),
  ];
  const sum = (key) => components.reduce((total, c) => total + c[key], 0);
  const calories = sum("calories");
  return {
    foodName: "Telur dadar + nasi", portionNote: "1 piring", confidence: "medium",
    kcalLow: Math.round(calories * 0.85), kcalHigh: Math.round(calories * 1.25),
    calories, protein_g: sum("protein_g"), carbs_g: sum("carbs_g"), fat_g: sum("fat_g"), sugar_g: 0, components,
  };
};
const oneEgg = () => analysis(component("Telur dadar", "other", 60, 140, 7, 1, 11));
const fourEggs = () => analysis(component("Telur dadar", "other", 240, 560, 28, 4, 44));

module.exports = async function verifyMealCorrection({ page, base, store, today, offset }) {
  const dayKey = (date) => `mk:u3:day:${date}`;
  const meals = (date) => JSON.parse(store.get(dayKey(date))).meals;
  const uploads = [];
  const refines = [];
  await page.route("**/api/analyze-food", (route) => {
    uploads.push(route.request().postData() || "");
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ analysis: oneEgg() }) });
  });
  await page.route("**/api/refine-food", (route) => {
    refines.push(JSON.parse(route.request().postData()));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ analysis: fourEggs() }) });
  });

  try {
    await page.goto(`${base}/makan`);
    // 1. A note goes with the photo, and the review lets the egg count and the protein be set.
    await page.getByLabel("Keterangan untuk AI (opsional)").fill("telur 3 butir");
    await page.locator('input[type="file"]:not([capture])').setInputFiles({ name: "makan.jpg", mimeType: "image/jpeg", buffer: JPEG });
    await page.getByRole("button", { name: "Tambah Telur dadar", exact: true }).waitFor();
    assert.match(uploads[0], /name="note"\r\n\r\ntelur 3 butir/, "the note did not travel with the photo");

    const protein = page.getByRole("textbox", { name: "Protein", exact: true });
    const kcal = page.getByRole("textbox", { name: "Kalori", exact: true });
    assert.equal(await protein.inputValue(), "11");
    assert.equal(await kcal.inputValue(), "430");
    const add = page.getByRole("button", { name: "Tambah Telur dadar", exact: true });
    for (let i = 0; i < 3; i++) await add.click();
    assert.equal(await page.getByLabel("Jumlah Telur dadar").innerText(), "×3");
    assert.equal(await protein.inputValue(), "25", "three eggs should carry 21 g of protein");
    assert.equal(await kcal.inputValue(), "710");
    // Rice and oil keep their own controls, and the other ingredient is left alone.
    assert.equal(await page.getByLabel("Jumlah Timun").innerText(), "×1");

    await protein.fill("27");
    await page.getByText("Protein memakai angka yang kamu isi").waitFor();
    await page.getByRole("button", { name: "Simpan ke catatan hari ini", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Tersimpan: Telur dadar + nasi" }).waitFor();

    let saved = meals(today).find((meal) => meal.foodName === "Telur dadar + nasi");
    assert.ok(saved, "the photo meal was not saved");
    assert.equal(saved.protein_g, 27);
    assert.equal(saved.calories, 710);
    assert.equal(saved.breakdown.proteinEdit, 27);
    assert.equal(saved.breakdown.note, "telur 3 butir");
    assert.deepEqual(saved.breakdown.adjust.scales, [1, 1, 3, 1]);
    assert.match(saved.portionNote, /Telur dadar ×3/);
    assert.match(saved.portionNote, /protein dikoreksi manual/);

    // 2. The history shows what the meal is made of.
    const row = page.locator('[aria-controls^="detail-"]').filter({ hasText: "Telur dadar + nasi" });
    await row.click();
    const detail = page.getByRole("list", { name: "Rincian bahan" });
    await detail.waitFor();
    const text = await detail.innerText();
    assert.match(text, /Nasi putih/);
    assert.match(text, /Telur dadar[\s\S]*420 kcal · 21 g protein/);
    await page.getByText("Protein memakai angka yang diisi, bukan hitungan rincian.").waitFor();
    await page.getByText("Keterangan: telur 3 butir").waitFor();

    // 3. Correct it: fewer eggs, then recalculate from a note.
    await page.getByRole("button", { name: "Koreksi", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Koreksi makanan" });
    await dialog.waitFor();
    assert.equal(await dialog.getByRole("textbox", { name: "Protein", exact: true }).inputValue(), "27", "the typed protein was not restored");
    assert.equal(await dialog.getByLabel("Jumlah Telur dadar").innerText(), "×3");
    await dialog.getByRole("button", { name: "Kurangi Telur dadar", exact: true }).click();
    assert.equal(await dialog.getByLabel("Jumlah Telur dadar").innerText(), "×2");
    assert.equal(await dialog.getByRole("textbox", { name: "Protein", exact: true }).inputValue(), "18", "changing an amount should drop the typed protein");
    assert.equal(await dialog.getByRole("textbox", { name: "Kalori", exact: true }).inputValue(), "570");

    await dialog.getByLabel("Keterangan untuk AI (opsional)").fill("telur 4 butir");
    await dialog.getByRole("button", { name: "Hitung ulang", exact: true }).click();
    await dialog.getByText("Sudah dihitung ulang").waitFor();
    assert.equal(refines.length, 1);
    assert.equal(refines[0].note, "telur 4 butir");
    assert.equal(refines[0].analysis.components[2].grams, 60, "the recalculation must start from the saved ingredients, not a photo");
    assert.equal(await dialog.getByRole("textbox", { name: "Protein", exact: true }).inputValue(), "32");
    assert.equal(await dialog.getByRole("textbox", { name: "Kalori", exact: true }).inputValue(), "850");
    await dialog.getByRole("button", { name: "Simpan koreksi", exact: true }).click();
    await dialog.waitFor({ state: "detached" });
    await page.getByRole("status").filter({ hasText: "Koreksi tersimpan" }).waitFor();

    saved = meals(today).find((meal) => meal.id === saved.id);
    assert.equal(saved.calories, 850);
    assert.equal(saved.protein_g, 32);
    assert.equal(saved.breakdown.note, "telur 4 butir");
    assert.equal(saved.breakdown.analysis.components[2].protein_g, 28);
    assert.equal(saved.breakdown.proteinEdit, null);
    assert.equal(typeof saved.editedAt, "string");
    assert.equal(saved.source, "photo");
    await page.getByText("dikoreksi", { exact: false }).first().waitFor();

    // 4. Yesterday can be opened and corrected too, and the window stops at seven days.
    const yesterday = offset(1);
    const before = meals(yesterday)[0];
    const completeBefore = JSON.parse(store.get(dayKey(yesterday))).foodLogComplete;
    const chips = page.getByRole("group", { name: "Pilih hari" }).getByRole("button");
    assert.equal(await chips.count(), 7);
    await chips.filter({ hasText: "Kemarin" }).click();
    await page.getByRole("heading", { name: "Riwayat Kemarin", exact: true }).waitFor();
    await page.locator('[aria-controls^="detail-"]').first().click();
    await page.getByText("Dicatat manual, jadi tidak ada rincian bahan.").waitFor();
    await page.getByRole("button", { name: "Koreksi", exact: true }).click();
    const plain = page.getByRole("dialog", { name: "Koreksi makanan" });
    await plain.getByRole("textbox", { name: "Protein", exact: true }).fill("22");
    await plain.getByRole("button", { name: "Simpan koreksi", exact: true }).click();
    await plain.waitFor({ state: "detached" });
    const fixed = meals(yesterday).find((meal) => meal.id === before.id);
    assert.equal(fixed.protein_g, 22);
    assert.equal(fixed.calories, before.calories, "an untouched field changed");
    assert.equal(JSON.parse(store.get(dayKey(yesterday))).foodLogComplete, completeBefore, "a correction reopened a confirmed day");

    // Put yesterday back the way the rest of the suite expects it. The detail
    // stays open after a correction, so only open it if it is not.
    const toggle = page.locator('[aria-controls^="detail-"]').first();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true", "the detail closed itself after a correction");
    await page.getByRole("button", { name: "Koreksi", exact: true }).click();
    await plain.getByRole("textbox", { name: "Protein", exact: true }).fill(String(before.protein_g));
    await plain.getByRole("button", { name: "Simpan koreksi", exact: true }).click();
    await plain.waitFor({ state: "detached" });
    assert.equal(meals(yesterday).find((meal) => meal.id === before.id).protein_g, before.protein_g);

    // 5. Clean up the meal added here.
    await page.getByRole("group", { name: "Pilih hari" }).getByRole("button", { name: "Hari ini", exact: true }).click();
    await page.getByRole("button", { name: /^Hapus Telur dadar/ }).click();
    // The saved-notice banner repeats the name, so wait on the stored log instead of the page text.
    for (let i = 0; i < 40 && meals(today).some((meal) => meal.id === saved.id); i++) await page.waitForTimeout(250);
    assert.equal(meals(today).some((meal) => meal.id === saved.id), false);

    await page.setViewportSize({ width: 320, height: 720 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "history overflow at 320px");
    await page.setViewportSize({ width: 390, height: 844 });
    console.log("Meal correction: PASS — note with the photo, ingredient amounts and typed protein, saved breakdown, detail in the history, correction with recalculation from a note, a past day, seven-day window.");
  } finally {
    await page.unroute("**/api/analyze-food");
    await page.unroute("**/api/refine-food");
  }
};
