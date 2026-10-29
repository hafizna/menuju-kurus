const assert = require("node:assert/strict");
const path = require("node:path");

// Run inside the authenticated smoke-test browser. Restoran used to be a tab of
// its own next to Ide makan. Both answer "what should I eat next with what is
// left today", so they are one tab with a switch: Di rumah and Di luar.
module.exports = async function verifyIdeMakan({ page, base, store, today, projectRoot }) {
  const dayKey = `mk:u3:day:${today}`;
  const meals = () => JSON.parse(store.get(dayKey) ?? '{"meals":[]}').meals;
  const luar = `${base}/makan?mode=cari&where=luar`;
  const group = page.getByRole("group", { name: "Makan di mana?" });
  const noOverflow = (message) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth).then((ok) => assert.equal(ok, true, message));
  let savedId = null;

  try {
    // 1. The Makan menu has three tabs now, and the Restoran one is gone.
    await page.goto(`${base}/makan`);
    const nav = page.getByRole("navigation", { name: "Pilihan makan" });
    assert.deepEqual((await nav.getByRole("link").allInnerTexts()).map((text) => text.trim()), ["Catat", "Ide makan", "Favorit"]);

    // 2. The old address lands on the "Di luar" side of Ide makan.
    await page.goto(`${base}/makan/restaurant`);
    await page.waitForURL(luar);
    await group.waitFor();
    assert.equal(await group.getByRole("button", { name: "Di luar", exact: true }).getAttribute("aria-pressed"), "true");
    assert.equal(await group.getByRole("button", { name: "Di rumah", exact: true }).getAttribute("aria-pressed"), "false");
    assert.equal(await nav.getByRole("link", { name: "Ide makan", exact: true }).getAttribute("aria-current"), "page");
    assert.equal(await page.getByText("Aku sedang mencari...", { exact: true }).isVisible(), false, "the home side should be hidden");

    // 3. Searching works, and the words are plain Indonesian.
    await page.getByRole("button", { name: "Cari keputusan terbaik", exact: true }).click();
    await page.getByText("Konteks keputusan saat ini", { exact: true }).waitFor();
    await page.getByText("Fullness", { exact: false }).first().waitFor();
    await page.screenshot({ path: path.join(projectRoot, ".next/validation/ide-makan-luar-390.png") });

    // 4. A menu can be written straight into today, and it shows in the history at once.
    const before = new Set(meals().map((meal) => meal.id));
    await page.getByRole("button", { name: "Catat 1x porsi", exact: true }).first().click();
    await page.getByRole("button", { name: "Tersimpan ✓", exact: true }).waitFor();
    const saved = meals().find((meal) => !before.has(meal.id));
    assert.ok(saved, "the menu was not saved");
    savedId = saved.id;
    assert.match(saved.portionNote, /estimasi restoran 1x/);
    assert.equal(saved.source, "manual");
    const toggle = page.locator('[aria-controls="riwayat-items"]');
    await toggle.waitFor();
    if ((await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
    await page.locator("#riwayat-items").getByText(saved.foodName, { exact: false }).first().waitFor();

    // 5. Switching sides keeps what was found, and the address follows the choice.
    await group.getByRole("button", { name: "Di rumah", exact: true }).click();
    await page.waitForURL(`${base}/makan?mode=cari`);
    await page.getByText("Aku sedang mencari...", { exact: true }).waitFor();
    assert.equal(await page.getByText("Konteks keputusan saat ini", { exact: true }).isVisible(), false);
    assert.equal(await nav.getByRole("link", { name: "Ide makan", exact: true }).getAttribute("aria-current"), "page");
    await group.getByRole("button", { name: "Di luar", exact: true }).click();
    await page.waitForURL(luar);
    await page.getByText("Konteks keputusan saat ini", { exact: true }).waitFor();

    // 6. Both sides fit a small phone.
    for (const [width, height] of [[390, 844], [320, 640]]) {
      await page.setViewportSize({ width, height });
      await noOverflow(`${width}px: Ide makan overflows`);
    }
  } finally {
    if (savedId) await page.evaluate(async ({ id, date }) => { await fetch(`/api/log?type=meal&id=${encodeURIComponent(id)}&date=${date}`, { method: "DELETE" }); }, { id: savedId, date: today });
    await page.setViewportSize({ width: 390, height: 844 });
  }
  console.log("Ide makan: PASS — one tab with Di rumah and Di luar, the old Restoran address lands on Di luar, a search with its results, a menu saved into today and shown in the history, the choice kept when switching, 390px and 320px layouts.");
};
