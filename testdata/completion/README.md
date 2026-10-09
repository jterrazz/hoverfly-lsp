# Completion corpus (`testdata/completion`)

The on-disk **fourslash corpus** for completion — the browsable, ground-truth-able analogue of the
diagnostics golden corpus (`testdata/{valid,invalid}` + `.diagnostics.json`). Each case is a REAL
Hoverfly simulation carrying one or more cursor markers; a sibling `.golden.json` holds, whole,
what the language service offers at each marker.

Runner: [`packages/analysis/specs/integration/contributions/completion-corpus.spec.ts`](../../packages/analysis/specs/integration/contributions/completion-corpus.spec.ts).
The hover corpus under [`testdata/hover`](../hover/README.md) follows the identical layout.

## Layout

```
testdata/completion/<context>/<case>.hoverfly.json   # marked simulation (the fixture)
testdata/completion/<context>/<case>.golden.json      # what the service answers, whole
```

`<context>` groups by completion situation (`matcher-name/`, `method-value/`, `http-values/`,
`schema-version/`, `post-serve-action/`, `state-keys/`, `negative/`, …). One assertion concern per
file keeps the tree browsable. A `broken/` segment anywhere in the path marks a fixture as
intentionally invalid (see [Validity invariant](#validity-invariant)).

### Service quirks worth knowing (ground truth, not bugs)

- **No current-word filtering.** `doComplete` returns the FULL matcher-name set even when the cursor
  sits mid-word (`"matcher": "ex⟦⟧"` still yields all 13); the editor — not the service — filters by
  prefix. The mid-word fixture under `matcher-name/broken/` pins this so a future filtering change is
  caught. Assert the full closed set there, not a filtered subset.
- **`schemaVersion` carries schema-`examples` duplicates.** At a `meta.schemaVersion` value position
  the list is 8 entries: the 4 contribution `vN` EnumMembers PLUS 4 quoted `"vN"` Value labels the
  bundled JSON schema injects from its `examples`; the golden holds all eight.
- **Sibling keys are deduped.** A state-key completion never re-offers a key already present as a
  sibling in the same `requiresState`/`transitionsState` object (the JSON service dedupes existing
  keys). `state-keys/login-fetch-flow` shows this: `session` is already a sibling, so only the
  cross-referenced `cart` is offered.

## The fixture (`.hoverfly.json`)

- A real simulation with **exactly the cursor markers** you assert on. The marker is the Unicode
  bracket pair `⟦⟧` (default/anonymous marker) or `⟦name⟧` (named, for multi-marker files). The
  bracket is a normal character inside a JSON string, so the document stays valid JSON once stripped.
- Place the marker so the **stripped** text is still meaningful. Two idioms:
  - empty insertion point — `"matcher": "⟦⟧"` strips to `"matcher": ""` (cursor between quotes);
  - cursor-before-token — `"matcher": "⟦⟧regex"` strips to `"matcher": "regex"` (cursor at the
    start of an existing valid token). Use this when an empty value would itself be a diagnostic
    (e.g. `schemaVersion`, which must be non-empty to keep the simulation fingerprint).

### Validity invariant

With markers stripped, the fixture **must be a valid simulation (zero diagnostics)** — the runner
asserts this. This keeps the corpus honest: a completion is exercised inside a real, well-formed
document, not an accidental error state. If you are deliberately testing mid-typing / broken-JSON
completion, put the fixture under a `.../broken/` subdir and the validity check is skipped.

## The golden (`.golden.json`)

```jsonc
{
  // the diagnostics of the marker-stripped fixture — `[]`, by the validity invariant; absent under broken/
  "diagnostics": [],
  // keyed by marker name, the single unnamed ⟦⟧ marker under "": the list as the editor shows it
  "markers": { "": [{ "kind": "EnumMember", "label": "exact" }] }
}
```

The whole list is the oracle: a label added, dropped or re-kinded fails the fixture, and a reviewed
change is recorded with `TEST_UPDATE=1 npm test`. A fixture whose service needs settings — the
`postServeAction` allowlist — reads them from a sibling `<case>.settings.json`
(`{ "registeredActions": ["webhook", "logger"] }`), passed to `createHoverflyLanguageService`.

## Adding a fixture

1. Pick or create a `<context>/` folder and write `<case>.hoverfly.json` with its cursor marker(s).
2. Run `TEST_UPDATE=1 npm test` from the repository root: the golden is recorded beside it, and the
   corpus index (`specs/integration/contributions/__expected__/completion-corpus.json`) gains the fixture.
3. Review the recorded golden like code: every label must be one the service should offer there.
