# testdata — the reference corpus

This tree is **the** behavioural contract for the Hoverfly LSP's semantic pipeline
(`packages/core/src/semantic/`). It is exercised by two tests:

- `packages/core/test/semantic/golden.test.ts` — every `invalid/` fixture must produce
  exactly the diagnostics frozen in its sibling `.diagnostics.golden`; every `valid/`
  fixture must produce **zero** diagnostics end-to-end (parse → schema → template → HFxxx).
- `packages/core/test/corpus.test.ts` — corpus-wide structural invariants.

## Layout & conventions

```
testdata/
  valid/<domain>/<name>.hoverfly.json              # 0 diagnostics through the full pipeline
  invalid/<domain>/<name>.hoverfly.json            # triggers exactly one HFxxx code (its point)
  invalid/<domain>/<name>.hoverfly.json.diagnostics.golden   # frozen expected diagnostics
```

- Fixture files are named `*.hoverfly.json`. The base name describes the fixture's single point
  (e.g. `hf210-domatch-after-glob`, `jwt-on-authorization-header`).
- `<domain>` groups by feature area (`matchers`, `templating`, `response`, `state`, `versions`,
  `realworld`, `globalactions`, `meta`, `parse`) or by code family (`hf2xx`, `hf3xx`, …).
- Fixtures are realistic API-mocking scenarios — real-looking paths/payloads, small but complete.
- An `invalid/` fixture must trigger **exactly** its intended code (no incidental extra diagnostics).
- A `valid/` fixture producing any diagnostic is either a fixture bug or a validator false-positive —
  fix the fixture or report the bug; never delete the check.

### `doMatch` shape (important)

Hoverfly's official v5.x schema requires `doMatch` to be a **single object**
(`"doMatch": { "matcher": …, "value": … }`), recursive. It is **not** an array. Real Hoverfly
v1.12.8 rejects `"doMatch": [ … ]` with HTTP 400. The entire corpus now uses the object form.

## Regenerating goldens

```bash
env UPDATE_GOLDENS=1 npx vitest --run packages/core/test/semantic/golden.test.ts
```

Always **review** each regenerated golden: it must contain only the codes the fixture is
designed to trigger. An unexpected extra code means the fixture has a side problem (fix the
fixture); a missing code means a validator gap (report it — do not paper over).

## Counts (this revision)

| | valid | invalid (= goldens) |
|---|---|---|
| **total** | **54** | **107** |

Invalid per domain: globalactions 3, hf1xx 3, hf2xx 11, hf3xx 7, hf4xx 1, hf5xx 10, hf6xx 1,
matchers 26, meta 5, parse 1, response 5, state 4, templating 30.

Valid per domain: hf2xx 2, hf4xx 1, hf5xx 3, matchers 17, realworld 4, response 7, state 4,
templating 11, versions 3, root 2.

## Coverage matrix (computed, this revision)

**HF codes — count of invalid fixtures triggering each** (target ≥2; HF1xx ≥1;
HF602 and the HF101/HF102 families are settings-gated and exempt):

```
HF103=3  HF104=3  HF201=3  HF202=3  HF203=9  HF204=3  HF205=2  HF206=3  HF207=3
HF208=2  HF209=2  HF210=3  HF211=3  HF301=2  HF302=2  HF303=2  HF304=2  HF305=2
HF306=2  HF307=2  HF401=3  HF402=2  HF403=2  HF501=3  HF502=5  HF503=4  HF504=5
HF505=3  HF506=3  HF507=3  HF508=8  HF509=3  HF510=3  HF601=3
exempt: HF101 HF102 HF602
```

All non-exempt codes meet their target.

- **Matchers** — all 14 registry matchers (`array exact form glob json jsonpartial jsonpath
  jwt jwtjsonpath negate regex xml xmltemplated xpath`) appear in ≥1 valid fixture.
- **Helpers** — all 52 Hoverfly helpers + 8 raymond built-ins are used validly in the valid corpus (60/60).
- **Response fields** — all 11 (`status body bodyFile encodedBody headers templated fixedDelay
  logNormalDelay postServeAction removesState transitionsState`) appear in valid fixtures.

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
