# Hover corpus (`testdata/hover`)

The on-disk **fourslash corpus** for hover — the browsable, ground-truth-able analogue of the
diagnostics golden corpus (`testdata/{valid,invalid}` + `.diagnostics.golden`). Each case is a REAL
Hoverfly simulation carrying one or more cursor markers; a sibling `.expect.json` sidecar pins what
the rendered hover markdown must (and must not) contain at each marker.

Runner: [`packages/core/test/contributions/corpus.test.ts`](../../packages/core/test/contributions/corpus.test.ts)
(shared with the completion corpus). The completion corpus under
[`testdata/completion`](../completion/README.md) has the same layout — read it for the full marker
and validity-invariant explanation; this file documents only the hover-specific sidecar shape.

## Layout

```
testdata/hover/<context>/<case>.hoverfly.json   # marked simulation (the fixture)
testdata/hover/<context>/<case>.expect.json     # the expectation sidecar
```

`<context>` groups by what is hovered:

- `matchers/` — one fixture per registry/pseudo matcher (the 14 names + `form`). Asserts the
  matcher's real registry docs + `Value type:`, and (the **no-panic-noise** regression target)
  EXCLUDES the generic `CRASHES` / `Unknown matcher name` / config-misuse leakage. The
  matcher-SPECIFIC `⚠️` notes that MUST survive are pinned as `includes`: `array`'s config-key
  note, `form`'s body-only note, `negate`'s vacuous-true note.
- `helpers/` — hover on a template-helper name (inline + block families).
- `faker/` — hover on a `faker '<type>'` argument (zero-arg note); the parameterized
  panic-at-render case lives under `faker/broken/` (its template is intentionally a footgun, so
  the marker-stripped doc is NOT a clean simulation).
- `request-members/` — hover on a `Request.<member>` token (incl. the `Body` kubectl-JSONPath note).
- `fields/` — hover on a top-level JSON key the schema documents (proves schema hover is intact).
- `negative/` — hover on a plain `status` number / body string: asserts NO Hoverfly matcher/helper
  hover leaks (schema-only or nothing).

A `broken/` path segment marks a fixture as intentionally invalid and skips the validity check.

### The `form` matcher exclude caveat

The no-panic-noise policy strips the GENERIC appended notes (`unknown matcher name panics`,
`config on a non-array matcher panics`). It does NOT touch a matcher's own registry `docs` text.
`form`'s intrinsic docs legitimately use the word "PANICs" to describe its case/placement footgun
(matcher-specific behaviour that must survive), so `form`'s sidecar excludes only the generic leak
signals (`CRASHES`, `Unknown matcher name`) — NOT a bare `"PANIC"` substring. Every other matcher
has no `PANIC`/`CRASHES` in its own docs, so those words ARE in their `excludes`.

## The fixture (`.hoverfly.json`)

Same marker rules as the completion corpus: `⟦⟧` (default) / `⟦name⟧` (named), placed so the
**marker-stripped** document is a valid simulation (zero diagnostics) — the runner asserts this
unless the fixture is under a `.../broken/` subdir. For an on-token hover, put the cursor at the
start of the token: `"matcher": "⟦⟧jwt"` strips to `"matcher": "jwt"` with the cursor on `jwt`.

## The sidecar (`.expect.json`)

```jsonc
{
  // OPTIONAL: per-fixture service settings, passed to createHoverflyLanguageService.
  "settings": { },

  "markers": {
    // Keyed by marker name. The single unnamed ⟦⟧ marker uses the key "".
    "": {
      // Substrings of the RENDERED hover markdown that MUST appear:
      "includes": ["jwt", "JWT match", "Value type:"],
      // Substrings that MUST NOT appear — pins the "no panic noise" hover policy:
      "excludes": ["CRASHES", "PANIC", "Unknown matcher name", "⚠️"]
    }
  }
}
```

TypeScript types: `CorpusExpectation` / `HoverMarkerExpectation` in
[`test/fourslash/harness.ts`](../../packages/core/test/fourslash/harness.ts).

- **`includes` / `excludes`** are substring assertions against the rendered markdown, sourced from
  the real service (docs come from the registry — never hardcode a string the renderer does not
  emit). `excludes` is where the hover-noise policy is enforced: a matcher hover describes THAT
  matcher only and must not carry the generic "unknown matcher name panics" / "config panics"
  warnings (HF201/HF204 diagnostics own that messaging). A matcher with no intrinsic footgun (e.g.
  `regex`, `jwt`) carries no `⚠️` note, so `"⚠️"` belongs in its `excludes`.
- Every marker in the fixture must have an entry here, and vice-versa — the runner flags either drift.

## Adding a fixture

1. Write `<context>/<case>.hoverfly.json` with the cursor marker(s) on what you want hover for.
2. Dump the ground truth:
   `CORPUS_DUMP=<case> npx vitest --run packages/core/test/contributions/corpus.test.ts`
   (prints the rendered hover markdown at each marker; no `--disableConsoleIntercept` needed).
3. Write `<case>.expect.json` — pick stable `includes` substrings, and add `excludes` to lock in
   absence (the no-panic-noise policy, or any string that must not leak).
4. Run `npx vitest --run packages/core/test/contributions/corpus.test.ts` — green when the
   stripped fixture validates (unless under `broken/`) and every marker matches its sidecar.
