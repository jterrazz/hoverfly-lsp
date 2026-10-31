# testdata, the reference corpus

This tree is **the** behavioural contract for the Hoverfly LSP's semantic pipeline
(`packages/analysis/src/semantic/`). It is run by
`packages/analysis/specs/integration/corpus/diagnostics.spec.ts`: every `invalid/` fixture must
produce exactly the diagnostics its sibling `.diagnostics.json` holds, and every `valid/` fixture
**zero** diagnostics end-to-end (parse, then schema, then template, then HFxxx).

## Layout & conventions

```
testdata/
  valid/<domain>/<name>.hoverfly.json              # 0 diagnostics through the full pipeline
  invalid/<domain>/<name>.hoverfly.json            # exactly the diagnostics of its golden
  invalid/<domain>/<name>.diagnostics.json         # its golden: those diagnostics, whole
```

- Fixture files are named `*.hoverfly.json`. The base name describes the fixture's point (e.g.
  `hf210-domatch-after-glob`, `jwt-on-authorization-header`). An `invalid/` fixture about an
  `HFxxx` code leads its name with that code, and every leading `hfNNN` must be in its golden; the
  one exception is `hf602-postserveaction-silent-without-settings`, which proves HF602 stays silent
  without the setting.
- `<domain>` groups by feature area (`matchers`, `matcher-syntax`, `templating`, `response`,
  `state`, `structure`, `variables`, `versions`, `realworld`, `globalactions`, `meta`, `parse`) or
  by code family (`hf1xx` to `hf6xx`).
- Fixtures are realistic API-mocking scenarios: real-looking paths/payloads, small but complete.
- An `invalid/` fixture produces **exactly** the diagnostics of its golden: an incidental extra
  diagnostic in a golden is a fixture with a second problem.
- A `valid/` fixture producing any diagnostic is either a fixture bug or a validator false-positive:
  fix the fixture or report the bug; never delete the check.

### `doMatch` shape (important)

Hoverfly's official v5.x schema requires `doMatch` to be a **single object**
(`"doMatch": { "matcher": ..., "value": ... }`), recursive. It is **not** an array. Real Hoverfly
v1.12.8 rejects `"doMatch": [ ... ]` with HTTP 400. The entire corpus now uses the object form.

## Regenerating goldens

```bash
TEST_UPDATE=1 npm test
```

Always **review** each regenerated golden: it must contain only the codes the fixture is
designed to trigger. An unexpected extra code means the fixture has a side problem (fix the
fixture); a missing code means a validator gap (report it; do not paper over).

## Ground-truth verification

**Status:** verified against real Hoverfly **v1.12.8** (hoverfly + hoverctl, brew tap, go 1.26.4)
on **2026-06-11**. Each fixture imported via `PUT /api/v2/simulation`. Full log:
`research/12-ground-truth-results.md`.

After the fixes in this revision, all `valid/` fixtures import clean against real Hoverfly except
one portability caveat:

- `valid/response/postserveaction-and-fixeddelay.hoverfly.json` references a `postServeAction`
  name (`notifyDownstream`) that is not registered with a stock Hoverfly, so a clean Hoverfly
  returns HTTP 500 at import. This is **runtime-registration state a document-only LSP cannot know**
  (architect decision: unknown `postServeAction` is information-only, gated on the
  `hoverfly.registeredActions` setting). Our pipeline correctly emits zero diagnostics. Kept as a
  valid fixture; the Hoverfly 500 is environmental, not a document defect.

The 10 previously-`valid` fixtures that real Hoverfly rejected for using array-shaped `doMatch`
have been converted to the correct object shape and now import clean.
