const assert = require("node:assert/strict");
const path = require("node:path");

// Runs in the authenticated smoke-test browser. The data requests are held back
// so the real waiting screen can be inspected: each pose, its motion, where it
// sits on the screen, and what remains when motion is reduced.
module.exports = async function verifyLoader({ page: main, base, projectRoot }) {
  const page = await main.context().newPage();
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 390, height: 844 });
  // The pose is picked at random, so the URL hash decides the roll for a run.
  await page.addInitScript(() => {
    const random = Math.random;
    Math.random = () => {
      const forced = /random=([\d.]+)/.exec(location.hash);
      return forced ? Number(forced[1]) : random();
    };
  });
  let stalled = true;
  const held = [];
  const gate = route => (stalled ? held.push(route) : route.continue());
  await page.route("**/api/today", gate);
  await page.route("**/api/fitness-intelligence", gate);
  const release = async () => {
    stalled = false;
    await Promise.all(held.splice(0).map(route => route.continue()));
  };
  const capture = name => page.screenshot({ path: path.join(projectRoot, `.next/validation/loader-${name}.png`) });
  const setTheme = theme => page.evaluate(theme => { localStorage.setItem("mk_theme", theme); window.dispatchEvent(new Event("mk-theme")); }, theme);
  const loader = () => page.locator(".kukang-loader");
  const noOverflow = message => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth).then(ok => assert.equal(ok, true, message));

  try {
    // 0 -> tennis racket, 0.5 -> football, 0.95 -> walking with the bag.
    const poses = [
      ["0", "juggle", ["racket", "tennis-ball"], ".kukang-ball"],
      ["0.5", "header", ["football"], ".kukang-ball"],
      ["0.95", "hustle", ["satchel"], ".kukang-rig"],
    ];
    for (const [roll, mood, props, mover] of poses) {
      stalled = true;
      // A change of hash alone would not reload the page, so start from a blank one.
      await page.goto("about:blank");
      await page.goto(`${base}/#random=${roll}`);
      await loader().getByText("Memuat harimu...", { exact: true }).waitFor();
      await page.waitForFunction(mood => document.querySelector(".kukang-loader .kukang")?.dataset.mood === mood, mood);
      await page.waitForFunction(() => document.querySelector(".kukang-loader .kukang")?.dataset.playing === "true");
      for (const prop of props) assert.equal(await loader().locator(`[data-prop="${prop}"]`).count(), 1, `${mood} is missing ${prop}`);
      assert.equal(await loader().getAttribute("role"), "status");
      assert.equal(await loader().locator(".kukang").getAttribute("aria-hidden"), "true", "the picture is decoration; the text is the status");

      // In the middle of the screen, not pinned to the top.
      const box = await loader().locator(".kukang").boundingBox();
      const middle = box.y + box.height / 2;
      assert.ok(middle > 844 * 0.35 && middle < 844 * 0.5, `${mood} loader sits at y=${Math.round(middle)}`);
      assert.ok(Math.abs(box.x + box.width / 2 - 195) < 8, `${mood} loader is off-centre`);
      await noOverflow(`${mood} loader overflow`);

      // The motion is real, not just declared.
      const joint = loader().locator(mover).first();
      const first = await joint.evaluate(node => getComputedStyle(node).transform);
      await page.waitForFunction(({ mover, first }) => getComputedStyle(document.querySelector(`.kukang-loader ${mover}`)).transform !== first, { mover, first });
      await capture(`${mood}-light`);

      if (mood === "juggle") {
        await setTheme("dark");
        await capture("juggle-dark");
        await page.setViewportSize({ width: 320, height: 640 });
        await noOverflow("loader 320px overflow");
        await page.setViewportSize({ width: 390, height: 844 });
        await setTheme("light");
      }
      if (mood === "header") {
        // With reduced motion the picture stays put but the words still say it is loading.
        await page.emulateMedia({ reducedMotion: "reduce" });
        assert.equal(await loader().locator(".kukang-motion").evaluateAll(nodes => nodes.every(node => getComputedStyle(node).animationName === "none")), true);
        const ball = await loader().locator('[data-prop="football"]').boundingBox();
        assert.ok(ball.y >= -40 && ball.y < 844 && ball.width > 20, "football is not visible at rest");
        await loader().getByText("Memuat harimu...", { exact: true }).waitFor();
        await capture("header-reduced-motion");
        await page.emulateMedia({ reducedMotion: "no-preference" });
      }

      await release();
      await page.getByText(/\/ 1800 kcal$/).first().waitFor();
      assert.equal(await loader().count(), 0, `${mood} loader stayed after the data arrived`);
    }

    // A tab inside a page gets the smaller version, with its own words.
    stalled = true;
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("about:blank");
    await page.goto(`${base}/progress?tab=fitness#random=0`);
    await loader().getByText("Memuat kebugaran...", { exact: true }).waitFor();
    await noOverflow("section loader 320px overflow");
    const width = (await loader().locator(".kukang").boundingBox()).width;
    assert.ok(width > 100 && width < 190, `section loader is ${Math.round(width)}px wide`);
    await capture("section-320");
    await release();
    await loader().waitFor({ state: "detached" });
  } catch (error) {
    await capture("failure").catch(() => {});
    throw error;
  } finally {
    await page.close();
  }
  console.log("Loader: PASS — juggling, football and walking poses, centred on the waiting screen, moving, hidden from screen readers, still readable with reduced motion, gone once data arrives, smaller inside a tab.");
};
