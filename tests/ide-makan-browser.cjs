const assert = require("node:assert/strict");
const path = require("node:path");

// Run inside the authenticated smoke-test browser. Restoran (a menu search of
// its own) overlapped with Ide makan, so it was removed. Ide makan is one tab,
// and the old address still lands on it.
module.exports = async function verifyIdeMakan({ page, base, projectRoot }) {
  const ide = `${base}/makan?mode=cari`;
  const noOverflow = (message) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth).then((ok) => assert.equal(ok, true, message));

  try {
    // 1. The Makan menu has three tabs, and Restoran is not one of them.
    await page.goto(`${base}/makan`);
    const nav = page.getByRole("navigation", { name: "Pilihan makan" });
    assert.deepEqual((await nav.getByRole("link").allInnerTexts()).map((text) => text.trim()), ["Catat", "Ide makan", "Favorit"]);

    // 2. The old address lands on Ide makan, which has no Di rumah / Di luar switch.
    await page.goto(`${base}/makan/restaurant`);
    await page.waitForURL(ide);
    await page.getByText("Aku sedang mencari...", { exact: true }).waitFor();
    assert.equal(await nav.getByRole("link", { name: "Ide makan", exact: true }).getAttribute("aria-current"), "page");
    assert.equal(await page.getByRole("group", { name: "Makan di mana?" }).count(), 0, "the Di rumah / Di luar switch should be gone");
    assert.equal(await page.getByText("Cari menu Indonesia tanpa foto").count(), 0, "the menu search should be gone");

    // 3. The menu search API is gone with it.
    const status = await page.evaluate(async () => (await fetch("/api/restaurant", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
    assert.equal(status, 404, "/api/restaurant should not exist");

    // 4. Ide makan itself still works.
    await page.getByRole("button", { name: "Cari yang paling bikin kenyang", exact: true }).click();
    await page.getByText("Ide buat makan berikutnya", { exact: true }).waitFor();
    await page.getByText("Kenyangnya", { exact: false }).first().waitFor();
    await page.screenshot({ path: path.join(projectRoot, ".next/validation/ide-makan-390.png") });

    // 5. It fits a small phone.
    for (const [width, height] of [[390, 844], [320, 640]]) {
      await page.setViewportSize({ width, height });
      await noOverflow(`${width}px: Ide makan overflows`);
    }
  } finally {
    await page.setViewportSize({ width: 390, height: 844 });
  }
  console.log("Ide makan: PASS — three Makan tabs, the old Restoran address lands on Ide makan, no menu search or API left, Ide makan still finds ideas, 390px and 320px layouts.");
};
