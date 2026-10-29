const assert = require("node:assert/strict");
const path = require("node:path");

// Run inside the authenticated smoke-test browser with synthetic /api/today
// responses. The actual SVG motion is sampled, not just its animation name.
module.exports = async function verifyMascot({ page, base, projectRoot, today }) {
  const original = await page.evaluate(async () => (await fetch("/api/today")).json());
  let fixture;
  const todayRoute = route => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fixture) });
  await page.route("**/api/today", todayRoute);
  const hero = page.getByRole("region", { name: "Sapaan harian", exact: true });
  const mascot = hero.locator(".kukang");
  const capture = name => hero.screenshot({ path: path.join(projectRoot, `.next/validation/mascot-${name}.png`) });
  async function scenario(hour, { meals = 0, calories = 0, protein = 0, sugar = 0, knownSugar = 0, complete = false, timezone = "Asia/Jakarta" } = {}) {
    fixture = structuredClone(original);
    fixture.settings.timezone = timezone;
    fixture.log.meals = Array.from({ length: meals }, (_, i) => ({ id: `scene-${i}`, foodName: "Catatan skenario", time: "06:00", calories: calories / meals, protein_g: protein / meals, source: "manual" }));
    fixture.log.foodLogComplete = complete;
    fixture.summary.caloriesIn = calories;
    fixture.summary.foodLogStatus = complete ? "complete" : meals ? "partial" : "empty";
    fixture.proteinToday = protein;
    fixture.sugarToday = { grams: sugar, knownMeals: knownSugar, totalMeals: meals, complete: meals > 0 && knownSugar === meals };
    const offset = timezone === "Asia/Tokyo" ? "+09:00" : "+07:00";
    await page.clock.setFixedTime(new Date(`${today}T${String(hour).padStart(2, "0")}:00:00${offset}`));
    await page.goto(base);
    await hero.waitFor();
    await page.waitForFunction(() => document.querySelector(".home-mascot .kukang")?.dataset.playing === "true");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `home overflow at ${hour}:00`);
  }
  async function expectMood(mood) {
    await page.waitForFunction(mood => document.querySelector(".home-mascot .kukang")?.dataset.mood === mood, mood);
  }
  async function expectMovement(selector) {
    const joint = mascot.locator(selector).first();
    const first = await joint.evaluate(node => getComputedStyle(node).transform);
    await page.waitForFunction(({ selector, first }) => {
      const joint = document.querySelector(`.home-mascot .kukang ${selector}`);
      return joint && getComputedStyle(joint).transform !== first;
    }, { selector, first });
  }
  try {
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await scenario(6);
    await expectMood("exercise");
    assert.equal(await mascot.locator('[data-prop="dumbbell"]').count(), 2);
    await expectMovement(".kukang-arm--left");
    await capture("morning-light");
    // Poses change by themselves, so there is nothing to tap.
    assert.equal(await hero.getByRole("button", { name: "Ganti pose kukang" }).count(), 0, "pose toggle should be gone");
    assert.equal(await page.locator(".home-mascot").evaluate(node => node.tagName), "DIV", "mascot is decoration, not a control");
    await scenario(8);
    await expectMood("hustle");
    assert.equal(await mascot.locator('[data-prop="satchel"]').count(), 1);
    await capture("hustle-light");
    // Browser is in Jakarta; the profile is Tokyo. 06:00 Tokyo is 04:00
    // Jakarta, so this catches accidental dependence on the device timezone.
    await scenario(6, { timezone: "Asia/Tokyo" });
    await expectMood("exercise");
    await scenario(10);
    await expectMood("work");
    assert.equal(await mascot.locator('[data-prop="laptop"]').count(), 1);
    await expectMovement(".kukang-arm--left");
    await capture("work");
    await scenario(16, { meals: 2, calories: 1400, protein: 30 });
    await expectMood("protein");
    assert.equal(await mascot.locator('[data-prop="drumstick"]').count(), 1);
    await expectMovement(".kukang-feeding-arm");
    await capture("protein");
    await scenario(16, { meals: 2, calories: 1400, protein: 30, sugar: 65, knownSugar: 1 });
    await expectMood("sugar");
    assert.equal(await mascot.locator('[data-prop="ice-cream"]').count(), 1);
    await expectMovement(".kukang-cheeks");
    await capture("sugar");
    await page.setViewportSize({ width: 320, height: 720 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, "sugar hero 320px overflow");
    await capture("sugar-320");
    await page.setViewportSize({ width: 390, height: 844 });
    await scenario(23, { meals: 2, calories: 1400, protein: 30, sugar: 65, knownSugar: 1 });
    await expectMood("neutral");
    assert.equal(await mascot.locator(".kukang-zzz").count(), 3);
    await expectMovement(".kukang-rig");
    await capture("sleep");
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await mascot.locator(".kukang-motion").evaluateAll(nodes => nodes.every(node => getComputedStyle(node).animationName === "none")), true);
    assert.equal(await mascot.locator(".kukang-zzz").evaluateAll(nodes => nodes.every(node => Number(getComputedStyle(node).opacity) > 0)), true, "sleep disappeared with reduced motion");
    await capture("sleep-static");
    await page.emulateMedia({ reducedMotion: "no-preference" });

    // Clock timers let us check the automatic rotation and off-screen/motion
    // pauses without waiting 20 seconds for each interval.
    // The next pose is random, so assert the rules rather than a fixed order:
    // it changes, stays within the 18:00 scenes, and never repeats the pose on
    // screen. At 18:00 the sequence is happy, dance and rest ("full").
    const evening = ["happy", "dance", "full"];
    const currentMood = () => page.evaluate(() => document.querySelector(".home-mascot .kukang")?.dataset.mood);
    const expectNewMood = async previous => {
      await page.waitForFunction(previous => {
        const mood = document.querySelector(".home-mascot .kukang")?.dataset.mood;
        return mood && mood !== previous;
      }, previous);
      const mood = await currentMood();
      assert.ok(evening.includes(mood), `unexpected pose ${mood}`);
      return mood;
    };
    await page.clock.install({ time: new Date(`${today}T18:00:00+07:00`) });
    await scenario(18);
    await expectMood("happy");
    const action = hero.getByRole("link", { name: "Catat makan", exact: true });
    const actionY = (await action.boundingBox()).y;
    await page.clock.fastForward(20_100);
    const second = await expectNewMood("happy");
    assert.equal((await action.boundingBox()).y, actionY, "changing pose shifted the meal action");
    await page.evaluate(() => { localStorage.setItem("mk_motion", "off"); window.dispatchEvent(new Event("mk-motion")); });
    await page.clock.fastForward(20_100);
    await expectMood(second);
    await page.evaluate(() => { localStorage.removeItem("mk_motion"); window.dispatchEvent(new Event("mk-motion")); });
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.clock.fastForward(20_100);
    await expectMood(second);
    await page.evaluate(() => scrollTo(0, 0));
    await page.clock.fastForward(20_100);
    const third = await expectNewMood(second);
    assert.notEqual(third, second);
    await page.clock.resume();
  } finally {
    await page.unroute("**/api/today", todayRoute);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.clock.setFixedTime(new Date());
    await page.goto(base);
  }
  for (const [destination, name] of [["/makan", "meal"], ["/progress?tab=body", "progress"], ["/settings", "profile"]]) {
    await page.goto(`${base}${destination}`);
    await page.locator(".journal-header").waitFor();
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: path.join(projectRoot, `.next/validation/journal-${name}.png`) });
    await page.setViewportSize({ width: 320, height: 720 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true, `${name} journal 320px overflow`);
    await page.setViewportSize({ width: 390, height: 844 });
  }
  await page.goto(base);
  console.log("Mascot: PASS — profile timezone, varied time-of-day poses, automatic random rotation, food context, visible joint movement, static sleep and reduced-motion/off-screen pauses.");
};
