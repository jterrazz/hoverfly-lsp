# Completion corpus (`testdata/completion`)

The on-disk **fourslash corpus** for completion — the browsable, ground-truth-able analogue of the
diagnostics golden corpus (`testdata/{valid,invalid}` + `.diagnostics.golden`). Each case is a REAL
Hoverfly simulation carrying one or more cursor markers; a sibling `.expect.json` sidecar pins what
the language service must (and must not) offer at each marker.

Runner: [`packages/core/test/contributions/corpus.test.ts`](../../packages/core/test/contributions/corpus.test.ts).
The hover corpus under [`testdata/hover`](../hover/README.md) follows the identical layout.

## Layout

```
testdata/completion/<context>/<case>.hoverfly.json   # marked simulation (the fixture)
testdata/completion/<context>/<case>.expect.json     # the expectation sidecar
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
  bundled JSON schema injects from its `examples`. Assert with `includes`, never `count`.
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

## The sidecar (`.expect.json`)

```jsonc
{
  // OPTIONAL: per-fixture service settings, passed to createHoverflyLanguageService.
  // e.g. postServeAction completion needs the runtime allowlist:
  "settings": { "registeredActions": ["webhook", "logger"] },

  "markers": {
    // Keyed by marker name. The single unnamed ⟦⟧ marker uses the key "".
    "": {
      "includes": ["exact", "regex", "form"],  // labels that MUST be present
      "excludes": [],                            // labels that MUST NOT be present
      "count": 14,                               // EXACT list size — closed sets only (see below)
      "kindOf": { "GET": "EnumMember" }          // CompletionItemKind name per label (optional)
    }
  }
}
```

TypeScript types: `CorpusExpectation` / `CompletionMarkerExpectation` in
[`test/fourslash/harness.ts`](../../packages/core/test/fourslash/harness.ts).

- **`includes` / `excludes`** are exact-label assertions sourced from the real service — never
  hardcode a label the service does not produce.
- **`count`** pins the *complete* list size. Use it ONLY for CLOSED enum sets so the corpus stays
  resilient to a later helper/faker/state-key being added. Known closed counts:
  | context | count |
  |---|---|
  | matcher names, off-body (path/headers/method/scheme/…) | 13 |
  | matcher names, on-body (adds `form`) | 14 |
  | HTTP methods (exact `method` value) | 9 |
  | URI schemes (exact `scheme` value) | 4 |

  Do NOT pin `count` for open sets (helpers, fakers, state keys) or for `schemaVersion` (its list
  carries harmless quoted-label duplicates from schema `examples`); assert those with `includes`.
- **`kindOf`** asserts the `CompletionItemKind` *name* (e.g. `"Value"`, `"EnumMember"`,
  `"Property"`, `"Snippet"`) for specific labels. Optional.
- Every marker in the fixture must have an entry here, and vice-versa — the runner flags either drift.

## Adding a fixture

1. Pick/create a `<context>/` dir and write `<case>.hoverfly.json` with the cursor marker(s).
2. Dump the ground truth:
   `CORPUS_DUMP=<case> npx vitest --run packages/core/test/contributions/corpus.test.ts`
   (prints the actual labels + kinds at each marker; no `--disableConsoleIntercept` needed).
3. Write `<case>.expect.json` from that output — `includes`/`excludes`, plus `count`/`kindOf` only
   where they hold. Keep it meaningful but resilient (prefer `includes` over `count` for open sets).
4. Run `npx vitest --run packages/core/test/contributions/corpus.test.ts` — green when the
   stripped fixture validates (unless under `broken/`) and every marker matches its sidecar.
