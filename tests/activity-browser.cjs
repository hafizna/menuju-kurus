const assert = require("node:assert/strict");

// Run inside the authenticated smoke-test browser. Logs activity by kind and
// duration on Home, checks the estimate, the saved entry, and removal.
module.exports = async function verifyActivity({ page, base, store, today }) {
  await page.goto(base);
  const card = page.getByRole("region", { name: "Gerak hari ini", exact: true });
  await card.waitFor();
  const choose = text => card.locator("label").filter({ hasText: text }).first().click();
  const save = card.getByRole("button", { name: "Simpan gerak", exact: true });
  const kcal = card.getByRole("textbox", { name: "Perkiraan energi", exact: true });
  const dayKey = `mk:u3:day:${today}`;
  const manualBurns = () => JSON.parse(store.get(dayKey)).burns.filter(burn => burn.source === "manual");

  // Nothing can be saved until the kind and the duration are both chosen.
  assert.equal(await save.isDisabled(), true, "save enabled with nothing chosen");
  await choose("Jalan kaki");
  assert.equal(await save.isDisabled(), true, "save enabled without a duration");
  await choose("30 mnt");
  assert.equal(await save.isEnabled(), true, "save still disabled after kind and duration");
  const walk30 = Number(await kcal.inputValue());
  assert.ok(walk30 > 0 && walk30 % 5 === 0, `estimate ${walk30}`);

  // The estimate follows the choice, a typed duration replaces the presets,
  // and a hand-edited number is dropped when the choice changes.
  await choose("Lari");
  assert.ok(Number(await kcal.inputValue()) > walk30, "running did not raise the estimate");
  await card.getByRole("textbox", { name: "Atau isi sendiri, dalam menit", exact: true }).fill("45");
  assert.equal(await card.getByRole("radio", { name: "30 mnt", exact: true }).isChecked(), false, "preset stayed selected while typing");
  await card.getByRole("textbox", { name: "Atau isi sendiri, dalam menit", exact: true }).fill("0");
  assert.equal(await save.isDisabled(), true, "0 minutes accepted");
  await card.getByRole("textbox", { name: "Atau isi sendiri, dalam menit", exact: true }).fill("");
  await choose("45 mnt");
  await kcal.fill("123");
  await choose("60 mnt");
  assert.notEqual(await kcal.inputValue(), "123", "edited estimate survived a new choice");

  // Save a walk with a hand-edited figure, as someone with a watch number would.
  await choose("Jalan kaki");
  await choose("45 mnt");
  await kcal.fill("140");
  const before = manualBurns().length;
  await save.click();
  await card.getByRole("status").filter({ hasText: "tercatat" }).waitFor();
  const saved = manualBurns();
  assert.equal(saved.length, before + 1);
  const entry = saved.at(-1);
  assert.deepEqual({ label: entry.label, durationMin: entry.durationMin, calories: entry.calories }, { label: "Jalan kaki", durationMin: 45, calories: 140 });
  await card.getByRole("list", { name: "Aktivitas tercatat hari ini" }).getByText("Jalan kaki · 45 mnt", { exact: true }).waitFor();
  assert.equal(await save.isDisabled(), true, "form was not reset after saving");

  // A failed save keeps what was typed.
  await choose("Renang");
  await choose("30 mnt");
  await page.route("**/api/log", route => route.request().method() === "POST"
    ? route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Simulasi simpan aktivitas gagal."}' })
    : route.continue());
  await save.click();
  await card.getByRole("alert").filter({ hasText: "Simulasi simpan aktivitas gagal" }).waitFor();
  assert.equal(await card.getByRole("radio", { name: "Renang", exact: true }).isChecked(), true, "failed save lost the choice");
  assert.equal(manualBurns().length, before + 1, "failed save still stored an entry");
  await page.unroute("**/api/log");

  // Remove the saved entry; the Apple Watch figure has no remove button.
  await card.getByRole("button", { name: "Hapus Jalan kaki · 45 mnt", exact: true }).click();
  await card.getByRole("list", { name: "Aktivitas tercatat hari ini" }).getByText("Jalan kaki · 45 mnt", { exact: true }).waitFor({ state: "detached" });
  assert.equal(manualBurns().length, before, "removed entry stayed in the log");
  assert.equal(await card.getByRole("button", { name: /^Hapus Apple Watch/ }).count(), 0, "synced entry can be removed");

  await page.setViewportSize({ width: 320, height: 720 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "activity card 320px overflow");
  await page.setViewportSize({ width: 390, height: 844 });
  console.log("Activity: PASS — kind + duration estimate, hand-edited energy, disabled until complete, saved with duration, failure keeps choice, removal, synced entry protected, 320px layout.");
};
