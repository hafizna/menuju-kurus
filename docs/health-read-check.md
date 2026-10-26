# Local Weight read check

**Slothly Health Read Check v1** is a separate diagnostic, not a new sync version or a claimed fix. It isolates one native Health query from the production Shortcut's metric selection, regex matching, availability variables, and API requests.

Install `public/shortcuts/slothly-health-read-check.shortcut` on the iPhone and run its tile. No account configuration or copying is required. It runs **Nothing → Find Health Samples (Weight, latest first, limit 1) → Count Items**. If one sample is readable, it displays **1** and that sample's original Start Date in ISO 8601 including time. Compare the complete date, especially its year, with Health. The date appears only locally; the diagnostic does not read the weight value itself.

If the count is **0**, the query returned no readable samples. That result alone does not identify the cause or prove that read permission was denied. A value visible in Health does not by itself prove that this Shortcut can read it. A native query/permission error may stop the workflow before Count; that system error is not intercepted or replaced with a success message.

The result is useful in two ways: a count of 1 establishes that the minimal native Weight query can return a sample on this device; a count of 0 or a native error points to a problem before production selection/availability/API handling. Neither result establishes a completed sync. A readable old measurement remains old; it is never relabeled with today's date.

The 11-action workflow has no network action, URL, bearer token, account configuration, clipboard access, file access, health-value output, or Health-writing action. Its only displayed measurement detail is the original date. No configuration, token, or real health sample is embedded in the public artifact. Do not replace the production sync Shortcut with this differently named diagnostic.

## Evidence and verification

- Weight query: actual exported locked Type predicate `Enumeration.Value: Weight`, UUID `FDBE497C-0493-4D21-85A0-5AFFA621CF9B` in [Kim's workflow archived by suliveevil](https://github.com/suliveevil/My-Siri-Shortcuts/blob/352a5007e518835fb285acd18a70198dc1cff4f3/assets/backup/%E8%BA%AB%E4%BD%93%E6%8C%87%E6%95%B0%E8%AE%A1%E7%AE%97%E5%99%A8.txt). The diagnostic adds no date filter.
- Count explicitly takes capital-I **Input**, not `WFInput`: actual export UUID `B18B0452-FF48-4B77-97E4-F0FE79FECCEC` in [MacStories' 51cc export](https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/golden-shortcuts/xml/51cc4e26d1044893a0c3f2f3630cf2d2.xml). **Items** is recorded in Count UUID `E5571204-4FD3-492F-8992-3E1F6352CE1D` in [the 332c export](https://github.com/viticci/shortcuts-playground-plugin/blob/main/codex/skills/shortcuts-playground/golden-shortcuts/xml/332c12a0060043b388b22b806be7ab58.xml). Nothing has no parameters in those exports. These are factual schema observations; no workflow implementation is copied.
- Start Date details and ISO 8601 with Include Time use the same inspected action shapes as the production generator. Only their local display is added here.

Build and check with Python's standard library:

```sh
python scripts/health-read-check-test.py
python scripts/health-read-check.py --sign
python scripts/health-read-check.py --check
```

The signing operation sends only this generic workflow to the HTTPS Shortcuty signing service, then checks the returned AEA1 marker and any reported input hash. The independent diagnostic manifest records source/artifact hashes and leaves physical-device verification pending. No existing production generator or artifact is rewritten.

Synthetic tests cover zero/one samples, original dates, local-only output, Count's actual exported input key, prohibited actions, and an uncaught native permission error. They do not prove Apple runtime behavior. The intended next validation is a physical iPhone run, returning only the count and date or the native error encountered.
