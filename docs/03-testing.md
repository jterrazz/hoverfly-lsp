# Testing

What proves a change here: one vitest run over the whole workspace, standing on
a fixture corpus that was verified against a real Hoverfly instance. This
chapter says what each suite holds, how a golden is regenerated, and where the
mechanical proof stops.

## The run

```bash
npm test        # each workspace member's own `test` script, plus the extension's
```

Each member collects its own tests through its own `vitest.config.ts`
(`@jterrazz/test`'s `defineSpecConfig()`), and a member with both kinds names
two projects — `unit()` for the `*.test.ts` beside `src/`, `integration()` for
`specs/integration/**/*.spec.ts`. `packages/analysis` and `packages/server`
trim the preset's 30-second default to 20 for their process- and
corpus-spawning suites; `editors/vscode` has only `unit()` and keeps the
default.

A module test sits beside the module it covers (`<file>.test.ts` next to
`<file>.ts`, under `src/`) — this is what most of `packages/analysis/src/`
carries. What stands on something OUTSIDE its module — the reference corpus, a
golden on disk, the built binary — is an integration spec: it lives under a
member's `specs/integration/<domain>/` as `<aspect>.spec.ts`, reaches the
runner `integration.specification.ts` at that facet root constructs, and runs
its subject through that runner's `.call()`. The suffix is the fork:
`.test.ts` is the unit's word, `.spec.ts` the assembled product's
(`@jterrazz/test`'s conventions).

| Suite                                                            | Proves                                                                                                                                             |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/analysis/specs/integration/semantic/golden.spec.ts`    | The full `doValidation` pipeline against every `testdata/{valid,invalid}` fixture and its golden                                                   |
| `packages/analysis/specs/integration/contributions/`             | Hover and completion through the fourslash harness, including the per-context coverage matrix and the on-disk `testdata/{completion,hover}` corpus |
| `packages/analysis/specs/integration/schema/`                    | The bundled schema and the standalone SchemaStore artifact stay in step                                                                            |
| `packages/analysis/specs/integration/corpus/fingerprint.spec.ts` | Corpus-wide structural invariants — naming, pairing, coverage floors                                                                               |
| `packages/analysis/specs/integration/fourslash/`                 | The cursor-marker harness itself                                                                                                                   |
| `packages/server/specs/integration/lsp/`                         | A real `initialize` handshake against the built bin over stdio                                                                                     |
| `editors/vscode/test/`                                           | How the extension resolves the server binary                                                                                                       |

## The reference corpus

`testdata/` is **the** behavioural contract for the semantic pipeline. Its rules
are owned by [testdata/README.md](../testdata/README.md) — the layout, the
per-domain counts and the coverage matrix live there, not here. What matters to
a change is the two-sided invariant it enforces:

- a `valid/` fixture produces **zero** diagnostics through the full pipeline
  (parse → schema → template → `HFxxx`);
- an `invalid/` fixture triggers **exactly** its one intended code, with the
  expected diagnostics frozen in a sibling `.diagnostics.golden`.

A `valid/` fixture that produces a diagnostic is either a fixture bug or a
validator false positive. Fix the fixture or report the bug — never delete the
check.

### Regenerating a golden

```bash
env UPDATE_GOLDENS=1 npx vitest --run packages/analysis/specs/integration/semantic/golden.spec.ts
```

Review every regenerated golden by hand. It must carry only the codes its
fixture is designed to trigger: an unexpected extra code means the fixture has a
second problem (fix the fixture), and a missing code means a validator gap
(report it, do not paper over it).

### Cursor-marker tests

Completion and hover are tested through a fourslash-style harness
(`packages/analysis/specs/integration/fourslash/harness.ts`). A cursor is written into a fixture
as `⟦⟧`, or `⟦name⟧` for several positions in one document — an ordinary
character inside a JSON string, so the document stays valid JSON once the marker
is stripped, and one that never appears in real Hoverfly content.

## Ground truth, and where it stops

The corpus is not merely self-consistent. Every `valid/` fixture was imported
into a real **Hoverfly v1.12.8** and confirmed to be accepted; the results, and
the corrections they forced, are `research/12-ground-truth-results.md`. That run
is what the zero-false-positive policy rests on, and it is a deliberate act, not
a suite: re-running it is a decision taken when the pinned upstream commit moves.

Two watchers guard the same ground continuously. `make lint` regenerates
`docs/reference/` and fails if the committed projection is stale — the `docs`
target of the `Makefile`, which the shared CI reaches through `make lint`.
`.github/workflows/schema-drift.yml` runs weekly, diffs Hoverfly's live schema
and the cited Go source files against the pinned baseline, and opens a single
tracking issue when they move — it never updates anything itself.

**Nothing mechanical proves an editor integration.** No suite drives a real VS
Code, Zed, IntelliJ or Claude Code session. What has been verified without one —
that every manifest parses, that the extension bundles and `vsce package`
succeeds, that the Zed crate compiles, and that each launcher completes an
`initialize` handshake — is listed under "Verified automatically" in
[MANUAL-QA.md](../MANUAL-QA.md), and of it only the vitest suites run on every
commit. The behaviour above that line is checked by a human against the rest of
that same checklist, which is why it is walked before a release
([04-operating.md](04-operating.md)).
