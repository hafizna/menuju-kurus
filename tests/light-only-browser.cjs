const assert = require("node:assert/strict");

// Run inside the authenticated smoke-test browser. The app has one look. A phone
// set to dark, or a "dark" choice saved by an older version, must still show the
// light page, and the settings no longer offer a theme.
module.exports = async function verifyLightOnly({ page, base }) {
  const look = () => page.evaluate(() => ({
    darkClass: document.documentElement.classList.contains("dark"),
    scheme: getComputedStyle(document.documentElement).colorScheme,
    page: getComputedStyle(document.body).backgroundColor,
    card: (() => { const card = document.querySelector(".bg-white"); return card ? getComputedStyle(card).backgroundColor : null; })(),
  }));
  try {
    await page.emulateMedia({ colorScheme: "dark" });
    await page.evaluate(() => localStorage.setItem("mk_theme", "dark"));
    for (const route of ["/", "/makan", "/settings"]) {
      await page.goto(`${base}${route}`);
      await page.locator("main").waitFor();
      const now = await look();
      assert.equal(now.darkClass, false, `${route}: the dark class was applied`);
      assert.equal(now.scheme, "light", `${route}: the page still asks for dark form controls`);
      assert.equal(now.page, "rgb(248, 243, 233)", `${route}: the page background is not the light paper colour`);
      if (now.card) assert.equal(now.card, "rgb(255, 253, 247)", `${route}: cards are not light`);
    }
    // Only the motion choice is left under Animasi.
    await page.getByRole("heading", { name: "Animasi", exact: true }).waitFor();
    assert.equal(await page.getByRole("radiogroup", { name: "Tema tampilan" }).count(), 0, "the theme choice is still offered");
    assert.equal(await page.getByRole("radio", { name: "Gelap", exact: true }).count(), 0);
    await page.getByRole("checkbox", { name: /^Kurangi animasi/ }).waitFor();
  } finally {
    await page.evaluate(() => localStorage.removeItem("mk_theme")).catch(() => {});
    await page.emulateMedia({ colorScheme: "light" });
  }
  console.log("Light only: PASS — a phone set to dark and an old saved \"dark\" choice both still show the light page, form controls stay light, and the settings offer only the motion choice.");
};
