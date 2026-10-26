# Apple Health → Slothly

Slothly's web app cannot read HealthKit directly. The included **Slothly Health Sync** Apple Shortcut reads the latest weight and body fat percentage on the iPhone, with permission, and sends them to the connected Slothly account. AFit or any other source app is responsible for putting its measurements into Apple Health first.

## Connect on iPhone

1. Open **Profil → Data kesehatan → Hubungkan Apple Health** in Slothly.
2. Download and open **Slothly Health Sync**. Add the signed shortcut to Apple's Shortcuts app. A file import may name it **slothly-health-sync** after the filename. In Slothly, set **Nama Shortcut di iPhone** to exactly the name shown in Shortcuts; the default matches that filename.
3. In Slothly, create the connection and choose **Salin konfigurasi**.
4. Choose **Buka Shortcut**. With the default installed name, this opens `shortcuts://run-shortcut?name=slothly-health-sync&input=clipboard`; the bearer token is transferred through the clipboard, not embedded in a URL. The URL follows the editable Shortcut name.
5. Verify the destination shown by the Shortcut. Allow the connection request, saving its configuration, and read access to weight/body fat when iOS asks. The Shortcut tests the token before saving its configuration.
6. Return to **Hubungkan Apple Health** and choose **Periksa status**. Check the last received measurement dates and data types against Apple Health, then open **Perjalanan** to compare the saved values.

Subsequent **Sinkronkan sekarang** runs use the same selected Shortcut name without input. They reuse the saved configuration. The Shortcut does not read unrelated clipboard content in this mode.

**If copying is blocked:** **Salin manual** is always available during setup. Automatic clipboard writes time out after 1.5 seconds and show the same manual path instead of leaving setup locked. Choose **Pilih teks**, use the iPhone selection menu's **Salin**, then **Sudah saya salin**. This explicit confirmation also works when the browser does not emit a copy event. Only clipboard setup is confirmed here; a real server receipt is still needed to show a completed Health sync. Configuration remains in page memory, and the chosen Shortcut name is the only new value stored in browser storage.

If Safari downloads the file instead of opening Shortcuts, open the downloaded `.shortcut` from Files and add it there. A direct file import is used; an iCloud share link is not required.

## What is read and saved

- Each metric is queried independently, sorted by its original **Start Date**, latest first, limited to one sample. The Shortcut sends one request containing whichever metrics exist. It does not relabel old measurements with today's date.
- Weight uses the sample's reported unit. `kg`, `lb`/`lbs`, `g`, and `st` are explicitly converted to kilograms. An unknown unit stops the run and asks the user to choose kg in Health; the Shortcut never guesses.
- Body fat uses the sample's displayed percentage value and `%` unit. For example, `30.3 %` is sent as `30.3`, without multiplying it by 100. Unknown units stop the run. Server-side value validation remains authoritative.
- Neither metric is written back to Apple Health. This version does not request steps, sleep, workouts, or full measurement history.
- The only persistent file created on the device is `Shortcuts/Slothly/connection.json`, holding `{endpoint,token}`. The Shortcuts folder can sync through iCloud according to the device's Files settings. This is not Keychain storage. Do not share the file. Revoke the connection in Slothly to invalidate its token; remove the file in Files if the configuration should also be removed from the device.
- The transferred clipboard token is replaced with the neutral text `Slothly` after successful configuration. Health values are never put on the clipboard or saved in a configuration file.

Running the Shortcut from its tile or Slothly is manual. Users can optionally create a **Time of Day → Run Shortcut → Slothly Health Sync** personal automation in Shortcuts after the first successful manual run. The available automatic-run options and whether an unlocked device is needed depend on iOS and its Health privacy rules; the app does not promise a permanent background connection.

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
    {"metric":"bodyFatPercent","value":30.3,"measuredAt":"2026-10-20T07:00:00+07:00"}
  ]
}
```

Each sample keeps its own original timestamp, including offset. Format Date uses the built-in **ISO 8601** format with **Include Time** enabled. Before sending, the Shortcut checks that the result contains hours, minutes, seconds, and either `Z` or an explicit `±HH:MM` timezone; fractional seconds are also accepted. An incomplete timestamp stops the run before any measurement request. The API validates the complete body before writes. A sync requires `status: "ok"`; only `received > 0` is reported as newly saved data. `received: 0` with ignored samples is reported as already present or older than the saved record. Missing success status or network/API failure never produces the success message. No Health samples means no ingest request and a clear no-data message.

## Build and validate

The generator uses only the Python 3 standard library and deterministic UUIDs:

```sh
python scripts/health-shortcut.py
python scripts/health-shortcut-test.py
python scripts/health-shortcut.py --check
```

The fixture suite executes the generated plist's branches with synthetic Health values and API responses. It checks weight conversion, independent measurement dates, one combined request, either metric alone, no-data, bad destinations, rejected requests, and unchanged results. Structural validation checks action references, control-flow groups, text attachment offsets, and absence of Health-writing actions.

To rebuild the installable artifact after a workflow change:

```sh
python scripts/health-shortcut.py --sign
python scripts/health-shortcut.py --check
```

`--sign` uploads **only the generic workflow** to the HTTPS Shortcuty Apple signing API. It never reads user environment configuration or health data. The returned file must begin with Apple's `AEA1` archive marker, and the input hash is checked when supplied by the signing service. Commit the generator, unsigned plist, signed file, and manifest together. The public signed artifact contains no user token or fixed account endpoint. Signing is a build-time operation; device sync requests do not go through Shortcuty.

The manifest records the signed/unsigned SHA-256 hashes, generator hash (normalized LF), action count, and signing service. The checked-in unsigned plist lets maintainers inspect all actions before installation.

**Verification limit:** a signed Apple archive, structural checks, synthetic branch tests, and API tests do not prove successful import or execution on a physical iPhone. Before describing this as device verified, import it on iPhone, grant only the two Health read permissions, compare both values/units/dates against Health, verify the server receipt, rerun to check duplicate handling, and test revoked permission and token. Keep that device check visible in release/testing notes until completed.

## Primary references

- [Apple: run a Shortcut from a URL](https://support.apple.com/guide/shortcuts/run-a-shortcut-from-a-url-apd624386f42/ios).
- [Apple: API requests, bodies and variables](https://support.apple.com/guide/shortcuts/request-your-first-api-apd58d46713f/ios).
- [Apple: dictionaries in Shortcuts](https://support.apple.com/guide/shortcuts/using-dictionaries-apd43b69f337/ios).
- [Apple: signed Shortcut command-line exports](https://support.apple.com/guide/shortcuts-mac/run-shortcuts-from-the-command-line-apd455c82f02/mac).
- [Shortcuty signing API documentation](https://github.com/Shortcuty/Signing-Server-API-Documentation).
- [Observed iOS Health action schemas, MacStories Shortcuts Playground](https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/HEALTHKIT.md), published under MIT; used as a schema reference, with no runtime dependency or copied program implementation.
