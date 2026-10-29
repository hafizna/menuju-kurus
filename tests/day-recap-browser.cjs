const assert = require("node:assert/strict");
const path = require("node:path");

// Run inside the authenticated smoke-test browser. A past day opens as two rings
// (calories outside, protein inside) with the words beside them, and the meals
// open only when the card is tapped. The day is written straight into the mock
// store, then put back the way it was.
module.exports = async function verifyDayRecap({ page, base, store, today, offset, projectRoot }) {
  const date = offset(3);
  const key = `mk:u3:day:${date}`;
  const original = store.get(key);
  const meal = (id, foodName, calories, protein_g, extra = {}) => ({ id, time: `${date}T05:00:00.000Z`, foodName, calories, protein_g, carbs_g: 0, fat_g: 0, source: "photo", ...extra });
  const seed = (log) => store.set(key, JSON.stringify({ date, meals: [], burns: [], ...log }));
  const stored = () => JSON.parse(store.get(key));
  const toggle = page.locator('[aria-controls="riwayat-items"]');
  const openDay = async () => {
    await page.goto(`${base}/makan`);
    // The chips run from six days ago to today, so the third day back is the fourth from the left.
    const chip = page.getByRole("group", { name: "Pilih hari" }).getByRole("button").nth(3);
    await chip.click();
    assert.equal(await chip.getAttribute("aria-pressed"), "true");
  };
  // Each drawn arc by its name; "calories-over" exists only past the target.
  const rings = () => page.locator("#riwayat [data-ring]").evaluateAll((nodes) => Object.fromEntries(nodes.map((node) => [node.getAttribute("data-ring"), {
    offset: Number(node.getAttribute("stroke-dashoffset")),
    full: Number(node.getAttribute("stroke-dasharray")),
    red: node.classList.contains("stroke-red-600"),
    sky: node.classList.contains("stroke-sky-500"),
    brand: node.classList.contains("stroke-brand-600"),
  }])));
  const noOverflow = (message) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth).then((ok) => assert.equal(ok, true, message));
  const burn = { id: "run", time: `${date}T06:00:00.000Z`, calories: 250, label: "Lari", source: "manual" };

  try {
    // 1. Over the target, short on protein, and not yet marked complete.
    seed({ meals: [meal("a", "Nasi ayam geprek", 1200, 30), meal("b", "Martabak", 750, 55)], burns: [burn] });
    await openDay();
    await toggle.waitFor();
    const text = await toggle.innerText();
    assert.match(text, /1\.950 \/ 1\.800 kcal/);
    assert.match(text, /Di atas target · lebih 150 kcal/);
    assert.match(text, /85 \/ 120 g/);
    assert.match(text, /Belum sampai target · kurang 35 g/);
    assert.match(text, /2 makanan · 250 kcal terbakar/);
    assert.match(text, /Lihat per makanan/);
    assert.equal(await toggle.getAttribute("aria-expanded"), "false");
    assert.equal(await page.locator("#riwayat-items").isVisible(), false, "the meals should stay behind the rings");
    assert.equal(await page.getByText("Nasi ayam geprek", { exact: true }).isVisible(), false);

    const { calories: calorie, "calories-over": overLap, protein } = await rings();
    assert.equal(calorie.offset, 0, "an exceeded target fills the whole first lap");
    assert.equal(calorie.brand, true, "the first lap keeps its own colour");
    assert.ok(overLap, "going past the target draws a second lap");
    assert.equal(overLap.red, true, "the part past the target is red");
    // 150 kcal over a 1800 kcal target: the red lap covers 150/1800 of the circle.
    assert.ok(Math.abs(overLap.offset - overLap.full * (1 - 150 / 1800)) < 0.01, `the red lap shows ${overLap.offset} of ${overLap.full}`);
    assert.equal(protein.sky, true);
    assert.ok(Math.abs(protein.offset - protein.full * (1 - 85 / 120)) < 0.01, `the protein ring shows ${protein.offset} of ${protein.full}`);
    await page.getByText("Catatan hari itu belum ditandai lengkap, jadi angkanya masih sementara.").waitFor();
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(projectRoot, ".next/validation/day-recap-390.png") });

    // 2. A tap opens the day's meals; a second one closes them again.
    await toggle.click();
    assert.equal(await toggle.getAttribute("aria-expanded"), "true");
    await page.getByText("Nasi ayam geprek", { exact: true }).waitFor();
    await page.getByText("Martabak", { exact: true }).waitFor();
    assert.match(await toggle.innerText(), /Tutup rincian/);
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(projectRoot, ".next/validation/day-recap-open-390.png") });
    await toggle.click();
    await page.locator("#riwayat-items").waitFor({ state: "hidden" });

    // 3. Marking the day complete is saved on that day and takes the warning away.
    await page.getByRole("button", { name: "Tandai lengkap", exact: true }).click();
    await page.getByText("Catatan hari itu belum ditandai lengkap", { exact: false }).waitFor({ state: "detached" });
    assert.equal(stored().foodLogComplete, true, "the day was not marked complete");
    assert.equal(stored().meals.length, 2, "marking complete changed the meals");
    assert.match(await toggle.innerText(), /1\.950 \/ 1\.800 kcal/);

    // 4. Inside the range with the protein met: calm colours, no warning, no button.
    seed({ foodLogComplete: true, meals: [meal("c", "Pecel ayam", 1500, 130)] });
    await openDay();
    await toggle.waitFor();
    const calm = await toggle.innerText();
    assert.match(calm, /1\.500 \/ 1\.800 kcal/);
    assert.match(calm, /Dalam rentang · sisa 300 kcal/);
    assert.match(calm, /Target tercapai · lebih 10 g/);
    assert.match(calm, /1 makanan(?! ·)/, "no activity, so no burned figure");
    const calmRings = await rings();
    const calmProtein = calmRings.protein;
    assert.equal(calmRings["calories-over"], undefined, "inside the range there is no red lap");
    assert.ok(Math.abs(calmRings.calories.offset - calmRings.calories.full * (1 - 1500 / 1800)) < 0.01, "the calorie ring shows 1500 of 1800");
    assert.equal(calmProtein.offset, 0, "a met protein target fills the inner ring");
    assert.equal(await page.getByRole("button", { name: "Tandai lengkap", exact: true }).count(), 0);
    assert.equal(await page.getByText("belum ditandai lengkap", { exact: false }).count(), 0);

    // 5. Below the range, and a hand-written meal without protein is flagged as such.
    seed({ meals: [meal("d", "Mie instan", 900, 0, { source: "manual" })] });
    await openDay();
    await toggle.waitFor();
    const low = await toggle.innerText();
    assert.match(low, /Di bawah rentang · kurang 900 kcal dari target/);
    assert.match(low, /Belum sampai target · kurang 120 g/);
    await page.getByText("1 makanan dicatat manual tanpa protein", { exact: false }).waitFor();

    // 6. A day with nothing in it has no rings, only the plain note.
    seed({});
    await openDay();
    await page.getByText("Tidak ada catatan pada hari ini.").waitFor();
    assert.equal(await toggle.count(), 0);

    // 7. The card fits the screen, down to 320px.
    seed({ meals: [meal("e", "Nasi Campur Sayur Urap, Bakwan Jagung, dan Tahu Krecek dengan Sambal Terasi Pedas", 1950, 85)], burns: [burn] });
    await openDay();
    await toggle.waitFor();
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await noOverflow(`${width}px: the recap overflows`);
      // The card is the button plus its border, so measure the card around it.
      const box = await toggle.locator("xpath=..").boundingBox();
      const history = await page.locator("#riwayat").boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, `${width}px: the card runs off the screen`);
      assert.ok(Math.abs(box.width - history.width) <= 1, `${width}px: the card is not as wide as the history`);
    }
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(projectRoot, ".next/validation/day-recap-320.png") });
    await toggle.click();
    await noOverflow("320px: the opened day overflows");
  } finally {
    if (original === undefined) store.delete(key); else store.set(key, original);
    await page.setViewportSize({ width: 390, height: 844 });
  }
  console.log("Day recap: PASS — a past day opens as calorie and protein rings with over/within/below words, the meals open on a tap, marking a day complete is saved, empty days stay plain, and the card fits 390px and 320px.");
};
