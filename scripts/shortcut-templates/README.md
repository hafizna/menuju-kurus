# Native Health query templates

These sanitized action exports preserve the Find Health Samples, Count, Get Value,
branch, and Sum actions from the user's working iPhone Shortcuts. All original
HTTP header values were removed before saving these fixtures. They contain no
Health sample results or personal configuration. Never replace them with a raw
signed export containing a configured token.

`../native-health-shortcuts.py` adds one installation question for private JSON
configuration, clears implicit input before each query, corrects the Watch wire
key/header spelling, and sends original measurement timestamps for body/fitness.
Native date predicate fields are intentionally retained, including stale values:
operator 1002 means Today, so an accompanying Number 7 is not a seven-day query.

Before each request, the generated template checks the native sample unit. It
accepts kg for weight, percent for body fat, BPM/count per minute for resting
heart rate, mL/kg/min for VO2, and kcal for active energy. Unsupported units stop
before sending the affected value; values are never silently converted. Every
energy sample's unit is checked, including mixed-unit lists, before its sum is
sent. A body fat value of 31.6 percent remains 31.6.

Generic signed templates are public. A Shortcut after personal configuration is
private and must not be shared. The installation and background automation still
need physical iPhone verification; local tests do not emulate iOS permissions.

Public signed download basenames are exactly `Slothly Berat.shortcut` and
`Slothly Watch.shortcut`. iPhone can use a downloaded filename as the installed
name, so lowercase aliases must not be published for these new templates.
