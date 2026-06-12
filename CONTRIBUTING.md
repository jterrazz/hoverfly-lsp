# Contributing to hoverfly-lsp

Thanks for helping improve the Hoverfly Language Server. This guide covers the dev setup, the
reference-corpus conventions, how to regenerate goldens and docs, and where the project's
"why is it this way?" answers live.

## Dev setup

Requirements: **Node ≥ 20** (see `.nvmrc`), npm. This is an npm-workspaces monorepo.

```bash
npm install            # or: make install (npm ci, pinned)
npm run build          # tsc build across all workspaces (core, server, editors/vscode)
npm test               # vitest (869 tests)
npm run typecheck      # tsc --build
npm run lint           # @jterrazz/codestyle: oxlint + oxfmt + tsgo + knip
npm run lint:fix       # autofix lint/format issues
```

A `Makefile` wraps the same gates (`make build/test/typecheck/lint`) with an install guard.

**Gates:** every PR must keep `build`, `test`, `typecheck`, and `lint` green; CI
(`.github/workflows/validate.yml`) runs them on Node 20 and 22, plus a docs-drift check (below).

### Layout

```
packages/core     @hoverfly-lsp/core   — pure analysis library (zero LSP transport deps)
packages/server   hoverfly-lsp         — stdio LSP server (the published bin)
editors/          vscode / zed / intellij / claude-code integrations
testdata/         the reference corpus (valid/ + invalid/ goldens)
docs/             generated diagnostics + template reference
scripts/          doc generators
research/         research reports + architect decisions
```

Dependency direction is strict: `editors → server → core`. `packages/core` must never gain LSP
transport dependencies — it depends only on `vscode-json-languageservice`,
`vscode-languageserver-types`, and `vscode-languageserver-textdocument` (architect decision D1).

## Reference-corpus conventions

`testdata/` is **the** behavioural contract for the semantic pipeline. Read
[testdata/README.md](./testdata/README.md) for the authoritative rules; in short:

- Fixtures are named `*.hoverfly.json` and grouped by domain or code family.
- A `valid/` fixture must produce **zero** diagnostics through the full pipeline (parse → schema →
  template → HFxxx). Any diagnostic is either a fixture bug or a validator false-positive — fix the
  fixture or report the bug; never delete the check.
- An `invalid/` fixture must trigger **exactly** its one intended `HFxxx` code (no incidental
  extras), with its expected diagnostics frozen in a sibling `<name>.hoverfly.json.diagnostics.golden`.
- Fixtures should be realistic API-mocking scenarios — real-looking paths/payloads, small but
  complete.
- `doMatch` is a single recursive **object**, not an array (real Hoverfly rejects the array shape;
  see D9).

When you add a diagnostic rule or matcher behaviour, add corpus fixtures for it (at least one
`invalid/` per code, ideally a `valid/` counterpart).

## Regenerating goldens

After an intentional change to diagnostic output:

```bash
env UPDATE_GOLDENS=1 npx vitest --run packages/core/test/semantic/golden.test.ts
```

Always **review** each regenerated golden by hand: it must contain only the codes the fixture is
designed to trigger. An unexpected extra code means the fixture has a side problem (fix the
fixture); a missing code means a validator gap (report it — do not paper over it).

## Regenerating docs

`docs/diagnostics.md` and `docs/template-reference.md` are **generated** from the built core
package (`packages/core/dist`) by `scripts/generate-diagnostic-docs.mjs` — never hand-edit them.
The diagnostic table merges the runtime catalog (`packages/core/src/semantic/catalog.ts`: code,
severity, message) with the trigger/range prose carried in the generator from
`research/11-diagnostic-catalog.md`. The template reference is generated from
`registry/helpers.ts` and `registry/faker.ts`.

```bash
npm run build            # the generator imports the BUILT dist
npm run docs:diagnostics # writes docs/diagnostics.md + docs/template-reference.md
```

CI fails if the committed docs are stale (`npm run docs:diagnostics` then `git diff --quiet -- docs/`),
so commit the regenerated files alongside any catalog/registry change. If you add a new diagnostic
code without trigger/range prose, the generator aborts loudly — add a `DIAGNOSTIC_PROSE` entry in
the script.

## The `research/` provenance story

This server was not reverse-engineered from the Hoverfly docs (which are wrong in several places);
it was built against the Hoverfly **Go source** over two multi-agent research rounds and then
ground-truth-verified against a real Hoverfly instance:

- `research/01–05` — format, source truth, LSP architecture, IDE integration, prior art.
- `research/06` — the gaps/contradictions surfaced by round one.
- `research/07–09` — round-two source verification: matcher value types, the templating spec,
  the Claude Code LSP plugin shape.
- `research/10-architect-decisions.md` — **the authoritative tie-breaker.** When a report
  disagrees with this file, this file wins; and the Go-source report outranks docs-derived reports.
- `research/11-diagnostic-catalog.md` — the frozen `HFxxx` catalog spec (codes are stable API).
- `research/12-ground-truth-results.md` — results of importing every valid fixture into real
  Hoverfly v1.12.8 (drove the D9 corrections).

The registries in `packages/core/src/registry/` and the bundled schema are transcribed from
specific Go source paths and **pinned** to a `HOVERFLY_COMMIT` (see `schema/provenance.ts`); a
weekly CI job diffs upstream for drift. When in doubt about a behaviour, cite the relevant research
report (and ideally the Go source path) in your PR — keep the provenance chain intact.

## Pull requests

- Branch off `main`; keep all gates green; regenerate goldens and docs where applicable.
- Reference the architect decision (`D1`–`D9`) or research report that motivates a behavioural
  change.
- Diagnostic codes are append-only: never reuse or repurpose a code.
