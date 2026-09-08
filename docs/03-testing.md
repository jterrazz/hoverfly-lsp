# Testing

What proves a change here: one vitest run over the whole workspace, standing on
a fixture corpus that was verified against a real Hoverfly instance. This
chapter says what each suite holds, how a golden is regenerated, and where the
mechanical proof stops.

## The run

```bash
npm test        # vitest --run, the whole workspace
```

One root `vitest.config.ts` collects `packages/*/test/**/*.test.ts` and
`editors/vscode/test/**/*.test.ts`. The timeout is 20 seconds because the server
integration test spawns the built binary; everything else finishes in
milliseconds.

The suites, by what they stand on:

| Suite                               | Proves                                                                  |
| ----------------------------------- | ----------------------------------------------------------------------- |
| `packages/core/test/semantic/`      | Each rule family in isolation, plus the corpus goldens                  |
| `packages/core/test/contributions/` | Hover and completion, including the per-context coverage matrix         |
| `packages/core/test/template/`      | The Handlebars-subset parser, analyzer, source map and cursor context   |
| `packages/core/test/registry/`      | The transcribed matcher, helper and faker tables                        |
| `packages/core/test/schema/`        | The bundled schema and the standalone SchemaStore artifact stay in step |
| `packages/core/test/corpus.test.ts` | Corpus-wide structural invariants — naming, pairing, coverage floors    |
| `packages/server/test/integration/` | A real `initialize` handshake against the built bin over stdio          |
| `editors/vscode/test/`              | How the extension resolves the server binary                            |

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
env UPDATE_GOLDENS=1 npx vitest --run packages/core/test/semantic/golden.test.ts
```

Review every regenerated golden by hand. It must carry only the codes its
fixture is designed to trigger: an unexpected extra code means the fixture has a
second problem (fix the fixture), and a missing code means a validator gap
(report it, do not paper over it).

### Cursor-marker tests

Completion and hover are tested through a fourslash-style harness
(`packages/core/test/fourslash/harness.ts`). A cursor is written into a fixture
as `⟦⟧`, or `⟦name⟧` for several positions in one document — an ordinary
character inside a JSON string, so the document stays valid JSON once the marker
is stripped, and one that never appears in real Hoverfly content.

## Ground truth, and where it stops

The corpus is not merely self-consistent. Every `valid/` fixture was imported
into a real **Hoverfly v1.12.8** and confirmed to be accepted; the results, and
the corrections they forced, are `research/12-ground-truth-results.md`. That run
is what the zero-false-positive policy rests on, and it is a deliberate act, not
a suite: re-running it is a decision taken when the pinned upstream commit moves.

Two watchers guard the same ground continuously. `.github/workflows/validate.yml`
regenerates `docs/reference/` and fails if the committed projection is stale.
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
