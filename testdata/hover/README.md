# Hover corpus (`testdata/hover`)

The on-disk **fourslash corpus** for hover: the browsable, ground-truth-able analogue of the
diagnostics golden corpus (`testdata/{valid,invalid}` + `.diagnostics.json`). Each case is a REAL
Hoverfly simulation carrying one or more cursor markers; a sibling `.golden.json` holds, whole,
the hover Markdown the language service renders at each marker.

Runner: [`packages/analysis/specs/integration/contributions/hover-corpus.spec.ts`](../../packages/analysis/specs/integration/contributions/hover-corpus.spec.ts)
The completion corpus under
[`testdata/completion`](../completion/README.md) has the same layout; read it for the full marker
and validity-invariant explanation; this file documents only the hover-specific sidecar shape.

## Layout

```
testdata/hover/<context>/<case>.hoverfly.json   # marked simulation (the fixture)
testdata/hover/<context>/<case>.golden.json      # what the service answers, whole
```

`<context>` groups by what is hovered:

- `matchers/`: one fixture per registry/pseudo matcher (the 14 names + `form`). Asserts the
  matcher's real registry docs + `Value type:`, and (the **no-panic-noise** regression target)
  EXCLUDES the generic `CRASHES` / `Unknown matcher name` / config-misuse leakage. The
  matcher-SPECIFIC `**Warning:**` notes that MUST survive are pinned as `includes`: `array`'s config-key
  note, `form`'s body-only note, `negate`'s vacuous-true note.
- `helpers/`: hover on a template-helper name (inline + block families).
- `faker/`: hover on a `faker '<type>'` argument (zero-arg note); the parameterized
  panic-at-render case lives under `faker/broken/` (its template is intentionally a footgun, so
  the marker-stripped doc is NOT a clean simulation).
- `request-members/`: hover on a `Request.<member>` token (incl. the `Body` kubectl-JSONPath note).
- `fields/`: hover on a top-level JSON key the schema documents (proves schema hover is intact).
- `negative/`: hover on a plain `status` number / body string: asserts NO Hoverfly matcher/helper
  hover leaks (schema-only or nothing).

A `broken/` path segment marks a fixture as intentionally invalid and skips the validity check.

### The `form` matcher exclude caveat

The no-panic-noise policy strips the GENERIC appended notes (`unknown matcher name panics`,
`config on a non-array matcher panics`). It does NOT touch a matcher's own registry `docs` text.
`form`'s intrinsic docs legitimately use the word "PANICs" to describe its case/placement footgun
(matcher-specific behaviour that must survive), so `form`'s sidecar excludes only the generic leak
signals (`CRASHES`, `Unknown matcher name`), NOT a bare `"PANIC"` substring. Every other matcher
has no `PANIC`/`CRASHES` in its own docs, so those words ARE in their `excludes`.

## The fixture (`.hoverfly.json`)

Same marker rules as the completion corpus: `⟦⟧` (default) / `⟦name⟧` (named), placed so the
**marker-stripped** document is a valid simulation (zero diagnostics); the runner asserts this
unless the fixture is under a `.../broken/` subdir. For an on-token hover, put the cursor at the
start of the token: `"matcher": "⟦⟧jwt"` strips to `"matcher": "jwt"` with the cursor on `jwt`.

## The golden (`.golden.json`)

```jsonc
{
  // the diagnostics of the marker-stripped fixture: `[]`, by the validity invariant; absent under broken/
  "diagnostics": [],
  // keyed by marker name, the single unnamed ⟦⟧ marker under "": the rendered Markdown, whole ("" when none)
  "markers": { "": "### `jwt` matcher\n\n..." }
}
```

The whole Markdown is the oracle, so the no-panic-noise policy is read in every golden: a matcher
hover carries the notes intrinsic to that matcher (`array`'s config keys, `form`'s body-only rule,
`negate`'s vacuous truth) and never the generic "unknown matcher name" or "config panics" warnings,
which HF201 and HF204 raise where the mistake is made.

## Adding a fixture

1. Write `<context>/<case>.hoverfly.json` with the cursor marker(s) on what you want hover for.
2. Run `TEST_UPDATE=1 npm test` from the repository root: the golden is recorded beside it, and the
   corpus index (`specs/integration/contributions/__expected__/hover-corpus.json`) gains the fixture.
3. Review the recorded golden like code: the Markdown must say only what that token is.
