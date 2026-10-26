# Apple Health → Slothly

Slothly's web app cannot read HealthKit directly. The included **Slothly Health Sync v5** Apple Shortcut offers weight, body fat percentage, VO2 max, and resting heart rate on the iPhone. It reads only the types selected for that run, with permission, and sends each selected type's latest available measurement to the connected Slothly account. AFit, Apple Watch, or another source is responsible for putting its measurements into Apple Health first. Missing measurements are not calculated or replaced with zero.

## Connect on iPhone

1. Open **Profil → Data kesehatan → Hubungkan Apple Health** in Slothly.
2. Download and open **Slothly Health Sync**. Add the signed shortcut to Apple's Shortcuts app. A file import may name it **slothly-health-sync** after the filename. In Slothly, set **Nama Shortcut di iPhone** to exactly the name shown in Shortcuts; the default matches that filename.
3. In Slothly, create the connection and choose **Salin konfigurasi**.
4. Choose **Buka Shortcut**. With the default installed name, this opens `shortcuts://run-shortcut?name=slothly-health-sync&input=clipboard`; the bearer token is transferred through the clipboard, not embedded in a URL. The URL follows the editable Shortcut name.
5. Verify the destination shown by the Shortcut. Allow the connection request and saving its configuration. The Shortcut tests the token before saving its configuration. In **Pilih data yang ingin dibaca**, choose only the types you want to read; allow those Health read permissions when iOS asks. Weight, body fat, VO2 max, and resting heart rate are all optional. The choices appear again on each run and are not stored in the account configuration.
6. Return to **Hubungkan Apple Health** and choose **Periksa status**. Check the last received measurement dates and data types against Apple Health, then open **Perjalanan** to compare the saved values.

Subsequent **Sinkronkan sekarang** runs use the same selected Shortcut name without input. They reuse the saved configuration. The Shortcut does not read unrelated clipboard content in this mode.

**If copying is blocked:** **Salin manual** is always available during setup. Automatic clipboard writes time out after 1.5 seconds and show the same manual path instead of leaving setup locked. Choose **Pilih teks**, use the iPhone selection menu's **Salin**, then **Sudah saya salin**. This explicit confirmation also works when the browser does not emit a copy event. Only clipboard setup is confirmed here; a real server receipt is still needed to show a completed Health sync. Configuration remains in page memory, and the chosen Shortcut name is the only new value stored in browser storage.

If Safari downloads the file instead of opening Shortcuts, open the downloaded `.shortcut` from Files and add it there. A direct file import is used; an iCloud share link is not required.

### Update an installed v1, v2, v3, or v4 Shortcut

Version 2 corrected the encoded JSON types in the connection test and measurement request. Version 3 added optional VO2 max and resting heart rate, but its metric picker had incorrectly wired Split Text and Combine Text inputs. Version 4 corrects both input keys to Apple's exported **`text`** parameter; **Choose from List** continues to use **`WFInput`**. This fixes the concrete wiring defect that could leave the picker without input and reach **Tidak ada jenis data yang dipilih** before a selection was made.

Version 5 corrects the weight query's Health picker label from the SDK-derived guess **Body Mass** to the actual exported **Weight** predicate. Its API metric stays `weightKg`; selected metrics, original measurement dates, and all unit conversions are unchanged. No other Health query labels or flow are changed in this correction.

A website refresh cannot update an already installed Shortcut. Download the current file from Slothly, install it in Shortcuts, and replace the earlier copy if iOS offers that choice. Keep **Nama Shortcut di iPhone** equal to the installed name. In the Shortcut editor, the introductory Comment action must say **Slothly Health Sync v5**. The destination and configuration file location are unchanged: if the saved connection remains valid, the new Shortcut can reuse it without copying configuration again. Only reconnect in Slothly if the file is missing or the connection test fails.

### A Health permission error is different from missing data

If iOS says **Shortcuts does not have access to your Body Fat Percentage data**, configuration may already be saved, but the run has stopped at Apple's Health read action. This is not a waiting or server-sync state. In v5, run again and select **Berat badan** without **Lemak tubuh** to sync weight independently. The same applies to denied VO2 max or resting-heart-rate access: leave that type unselected.

The system's broader **No Samples Found** message does not establish whether a read permission was denied or the query returned no readable samples. Seeing a recent value in the Health app establishes that Health has that value, but does not establish that Shortcuts has permission to read it. Version 5 fixes the concrete weight-label discrepancy; it does not claim that a particular user's permission state has been verified. An empty query result is skipped without assigning a zero value or reporting a successful import. A native Health action error may stop the run before the Shortcut can inspect an empty result.

To restore access, use the system error's **Show** button to inspect the failed action and the Health permissions for Shortcuts on that iPhone. Depending on iOS, those controls are in Health's profile/Apps and Services or Settings → Privacy & Security → Health. Grant only the read types you intend to sync, then rerun the Shortcut and select them. The Shortcut does **not** catch or bypass iOS runtime permission errors. Selecting a denied type may still stop the whole run before the combined request is sent; deselect it first. Empty results for an allowed type are skipped, and other selected types can still be sent.

## What is read and saved

- Each metric is queried independently, sorted by its original **Start Date**, latest first, limited to one sample. The Shortcut sends one request containing whichever metrics exist. It does not relabel old measurements with today's date.
- Weight is queried using the exported **Weight** picker label and uses the sample's reported unit. `kg`, `lb`/`lbs`, `g`, and `st` are explicitly converted to kilograms. An unknown unit stops the run and asks the user to choose kg in Health; the Shortcut never guesses.
- Body fat uses the sample's displayed percentage value and `%` unit. For example, `30.3 %` is sent as `30.3`, without multiplying it by 100. Unknown units stop the run. Server-side value validation remains authoritative.
- VO2 max is read from the **Cardio Fitness** Health picker type and sent as `vo2Max` in mL/kg/min. Explicit equivalent unit labels `ml/(kg*min)`, `mL/kg/min`, and `mL/(kg·min)` are recognized without changing the value. Resting heart rate is read from **Resting Heart Rate** and sent as `restingHeartRate` in BPM; `count/min`, `bpm`, and `beats/min` labels are recognized. Unsupported units stop before sending; there is no inferred conversion from an unknown unit.
- None of the four metrics is written back to Apple Health. This version does not request steps, sleep, workouts, continuous heart-rate samples, or full measurement history. VO2 max and resting heart rate are separate fitness observations, not substituted for manual profile inputs.
- The only persistent file created on the device is `Shortcuts/Slothly/connection.json`, holding `{endpoint,token}`. The Shortcuts folder can sync through iCloud according to the device's Files settings. This is not Keychain storage. Do not share the file. Revoke the connection in Slothly to invalidate its token; remove the file in Files if the configuration should also be removed from the device.
- The transferred clipboard token is replaced with the neutral text `Slothly` after successful configuration. Health values are never put on the clipboard or saved in a configuration file.

Running the Shortcut from its tile or Slothly is manual. Version 5 asks for metric selection on every run, so a Time of Day automation still needs that interaction. The app does not promise unattended execution or a permanent background connection.

## Wire contract

Configuration is JSON supplied as Shortcut Input, normally via `input=clipboard`:

```json
{"endpoint":"https://your-slothly-domain.example/api/health-sync","token":"generated-in-the-app"}
```

Only an HTTPS URL with the exact `/api/health-sync` path, without a query string or credentials, is accepted. When new configuration is supplied, the Shortcut shows the destination and first sends:

```http
POST /api/health-sync
Authorization: Bearer <token>
Content-Type: application/json

{"provider":"apple_health","test":true}
```

A configuration test requires response `status: "tested"`. It checks the connection without claiming that a measurement has been imported. A sync sends one typed JSON body, for example:

```json
{
  "provider": "apple_health",
  "samples": [
    {"metric":"weightKg","value":90.2,"measuredAt":"2026-10-25T07:00:00+07:00"},
    {"metric":"bodyFatPercent","value":30.3,"measuredAt":"2026-10-20T07:00:00+07:00"},
    {"metric":"vo2Max","value":37.8,"measuredAt":"2026-10-19T09:15:00-04:00"},
    {"metric":"restingHeartRate","value":63,"measuredAt":"2026-10-26T05:10:00+07:00"}
  ]
}
```

Each sample keeps its own original timestamp, including offset. Format Date uses the built-in **ISO 8601** format with **Include Time** enabled. Before sending, the Shortcut checks that the result contains hours, minutes, seconds, and either `Z` or an explicit `±HH:MM` timezone; fractional seconds are also accepted. An incomplete timestamp stops the run before any measurement request. The API validates the complete body before writes. A sync requires `status: "ok"`; only `received > 0` is reported as newly saved data. `received: 0` with ignored samples is reported as already present or older than the saved record. Missing success status or network/API failure never produces the success message. No Health samples means no ingest request and a clear no-data message.

For an API rejection, the alert identifies **Uji koneksi** or **Pengiriman pengukuran** and one safe code: `connection_invalid`, `request_invalid`, or `storage_unavailable`. Missing or unknown codes become `response_invalid`. Only locally defined explanations are shown; raw responses, tokens, configuration, and measurement values are never interpolated into failure alerts. A transport error raised by Apple's URL action may instead appear as the system's own error.

The underlying plist types follow actual exported Apple Shortcuts: `WFItemType` **0 = Text, 1 = Dictionary, 2 = Array, 3 = Number, 4 = Boolean**. Nested dictionary row values need two `WFDictionaryFieldValue` envelopes; Number rows hold `WFTextTokenString` values; Boolean rows use `WFNumberSubstitutableState` with `Value: 1` or `0`. In particular, the POST test must decode to JSON boolean `true`, and each sample value to a JSON number. Some prose schema references reverse Number/Dictionary codes; the exported XML fixtures linked below are the grounding source for these values.

## Build and validate

The generator uses only the Python 3 standard library and deterministic UUIDs:

```sh
python scripts/health-shortcut.py
python scripts/health-shortcut-test.py
python scripts/health-shortcut.py --check
```

The fixture suite executes the generated plist's branches with synthetic Health values and API responses. An independent strict wire decoder is grounded in minimal actual exported XML rows for Number, Boolean, and nested Dictionary, with source links and the original MIT notice in the test file. It rejects the earlier swapped Number/Dictionary codes, bare Boolean value, and missing nested Dictionary wrapper. It also checks all 15 nonempty metric subsets in one combined request, independent dates, units, selections, and no-data. A denied Body Fat permission is modeled as a runtime exception: leaving it unselected must prevent that action from being queried, while selecting it still raises the exception. The tests therefore do not claim to catch Apple's runtime error. Structural validation checks action references, control-flow groups, text attachment offsets, and absence of Health-writing actions. The decoder is a format regression check, not Apple's runtime.

The multi-select **Choose from List** parameter `WFChooseFromListActionSelectMultiple: true` is grounded in the actual exported XML fixture linked below. Split Text and Combine Text use **`text`** as their input key, grounded in actual exported action rows from `51cc4e26d1044893a0c3f2f3630cf2d2.xml`; the fixture suite retains those minimal rows with the original MIT attribution, and explicitly rejects either old `WFInput` wiring. Its simulator now reads only the actual `text` key instead of reproducing the v3 generator's mistake. The VO2 picker label **Cardio Fitness** is grounded in the current working workflow author's documentation, and **Resting Heart Rate** is corroborated by independent authors' generator sources. The SDK-derived reference's `shortcut_label_guess` is not treated as an observed export: in particular, its guessed **VO2 Max** label is not used. A physical iPhone must still verify that both fitness picker labels, returned units, and selected read permissions import and execute correctly on the user's iOS version.

The weight label is independently grounded in an actual exported Find Health Samples action, UUID `FDBE497C-0493-4D21-85A0-5AFFA621CF9B`, archived by suliveevil from Kim's workflow. Its locked Type row uses `Enumeration.Value: "Weight"`, not `Body Mass`. Only that functional predicate schema and factual picker label are retained in a separate test fixture with source attribution; no implementation from that workflow is copied. The test compares the generated weight predicate with the exported schema and rejects the earlier `Body Mass` guess.

To rebuild the installable artifact after a workflow change:

```sh
python scripts/health-shortcut.py --sign
python scripts/health-shortcut.py --check
```

`--sign` uploads **only the generic workflow** to the HTTPS Shortcuty Apple signing API. It never reads user environment configuration or health data. The returned file must begin with Apple's `AEA1` archive marker, and the input hash is checked when supplied by the signing service. Commit the generator, unsigned plist, signed file, and manifest together. The public signed artifact contains no user token or fixed account endpoint. Signing is a build-time operation; device sync requests do not go through Shortcuty.

The manifest records the signed/unsigned SHA-256 hashes, generator hash (normalized LF), action count, and signing service. The checked-in unsigned plist lets maintainers inspect all actions before installation.

**Verification limit:** a signed Apple archive, structural checks, synthetic branch tests, and API tests do not prove successful import or execution on a physical iPhone. Before describing v5 as device verified, import it on iPhone, select and grant only intended Health read types, compare values/units/dates against Health, verify the server receipt, rerun to check duplicate handling, and test selecting versus deselecting a denied permission and a revoked token. Keep that device check visible in release/testing notes until completed.

## Primary references

- [Apple: run a Shortcut from a URL](https://support.apple.com/guide/shortcuts/run-a-shortcut-from-a-url-apd624386f42/ios).
- [Apple: API requests, bodies and variables](https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios).
- [Apple: dictionaries in Shortcuts](https://support.apple.com/guide/shortcuts/using-dictionaries-apd43b69f337/ios).
- [Apple: signed Shortcut command-line exports](https://support.apple.com/guide/shortcuts-mac/run-shortcuts-from-the-command-line-apd455c82f02/mac).
- [Shortcuty signing API documentation](https://github.com/Shortcuty/Signing-Server-API-Documentation).
- [Observed iOS Health action schemas, MacStories Shortcuts Playground](https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/HEALTHKIT.md), published under MIT; used as a schema reference, with no runtime dependency or copied program implementation.
- Actual exported XML schema fixtures, MacStories Shortcuts Playground (MIT, copyright 2026 Federico Viticci / MacStories): [Number row](https://github.com/viticci/shortcuts-playground-plugin/blob/main/claude/skills/shortcuts-playground/golden-shortcuts/xml/2e0fb675e45948aaacee7e534f910492.xml), [Boolean row](https://github.com/viticci/shortcuts-playground-plugin/blob/main/claude/skills/shortcuts-playground/golden-shortcuts/xml/3dd4ee24e43f464f92adaa70a0311eaa.xml), [nested JSON Dictionary row](https://github.com/viticci/shortcuts-playground-plugin/blob/main/claude/skills/shortcuts-playground/golden-shortcuts/xml/ef669bcf8bad489d9ef4b88bfaf5772f.xml). Minimal retained schema rows and their license notice are included in `scripts/health-shortcut-test.py`.
- [Actual exported multi-select Choose from List action](https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/golden-shortcuts/xml/71f0cacb0f604b399b76c5dcb7286e7c.xml), same MIT corpus.
- [Actual exported Split Text and Combine Text input keys](https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/golden-shortcuts/xml/51cc4e26d1044893a0c3f2f3630cf2d2.xml), same MIT corpus. Minimal retained rows and the license notice are included in `scripts/health-shortcut-test.py`.
- [Actual exported Weight type predicate](https://github.com/suliveevil/My-Siri-Shortcuts/blob/352a5007e518835fb285acd18a70198dc1cff4f3/assets/backup/%E8%BA%AB%E4%BD%93%E6%8C%87%E6%95%B0%E8%AE%A1%E7%AE%97%E5%99%A8.txt), Kim's workflow published 2020-02-11 and archived by suliveevil. Only its factual type-predicate schema is retained; this source is separate from the MacStories MIT corpus.
- [Working iOS workflow author's current Cardio Fitness picker label](https://gist.github.com/gurdiga/3be6a79e88c507485d68775dbfdf0641#file-sleep_cycles_2-md).
- [Independent Health Shortcut author's Resting Heart Rate query](https://github.com/danielhopkins/apple-tools/blob/95d8c9f8d0e1b2ca43e2fa02b1bd1e865489a392/plugins/health/build-shortcut.py).
