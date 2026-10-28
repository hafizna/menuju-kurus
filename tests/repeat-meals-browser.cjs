const assert = require("node:assert/strict");
const path = require("node:path");

// Run inside the authenticated smoke-test browser. A meal with a long name, as
// the AI often gives ("Nasi Campur Sayur Urap, Bakwan Jagung, dan Tahu ..."),
// must not make the "Makan yang sama lagi?" list wider than the screen. When it
// did, the whole page could be dragged sideways on a phone and the cards ran off
// the right edge.
const LONG = "Nasi Campur Sayur Urap, Bakwan Jagung, dan Tahu Krecek dengan Sambal Terasi Pedas";

module.exports = async function verifyRepeatMeals({ page, base, today, projectRoot }) {
  await page.goto(`${base}/makan`);
  const id = await page.evaluate(async (name) => {
    const response = await fetch("/api/log", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "meal", foodName: name, calories: 760, protein_g: 20, source: "manual" }),
    });
    return (await response.json()).entry.id;
  }, LONG);

  try {
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(`${base}/makan`);
      const card = page.getByRole("button").filter({ hasText: "Terakhir dicatat" }).filter({ hasText: "Nasi Campur Sayur Urap" });
      await card.waitFor();
      // Compared with the width asked for, not innerWidth: in phone emulation the browser widens
      // the window to fit the content, so innerWidth would agree with an overflowing page.
      const pageWidth = await page.evaluate(() => document.documentElement.scrollWidth);
      assert.ok(pageWidth <= width, `${width}px: the page is ${pageWidth}px wide`);
      // The card stays inside the screen with its calories in view, and the long name is shortened, not pushed out.
      const box = await card.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width, `${width}px: the card runs from ${Math.round(box.x)} to ${Math.round(box.x + box.width)}`);
      const kcal = await card.getByText("760 kcal +", { exact: true }).boundingBox();
      assert.ok(kcal.x + kcal.width <= width, `${width}px: the calories are cut off`);
      const name = card.locator("strong");
      assert.equal(await name.evaluate((node) => node.scrollWidth > node.clientWidth), true, `${width}px: the long name should be shortened with an ellipsis`);
      // The cards line up with the history below them.
      const history = await page.locator("#riwayat").boundingBox();
      assert.ok(Math.abs(box.x + box.width - (history.x + history.width)) <= 1, `${width}px: the card is wider than the history list`);
      if (width === 390) await page.screenshot({ path: path.join(projectRoot, ".next/validation/repeat-meals-390.png") });
    }
  } finally {
    await page.evaluate(async ({ id, date }) => { await fetch(`/api/log?type=meal&id=${encodeURIComponent(id)}&date=${date}`, { method: "DELETE" }); }, { id, date: today });
    await page.setViewportSize({ width: 390, height: 844 });
  }
  console.log("Repeat meals: PASS — a long meal name keeps the list, the page and the calories inside the screen at 390px and 320px.");
};
