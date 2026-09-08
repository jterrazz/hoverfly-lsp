# Developing

How a change is made here: the toolchain, the gates it must keep green, which
file a given change opens, and what it owes before it is committed.

## Setup

Node ≥ 20 (`.nvmrc` pins 20), npm workspaces, no other runtime.

```bash
npm install            # or: make install (npm ci, lockfile-pinned)
npm run build          # tsc --build across core, server and the VS Code extension
npm test               # vitest --run
npm run typecheck      # tsc --build
npm run lint           # typescript check: tsc, oxlint, oxfmt, knip, artefacts, docs layout
npm run lint:fix       # autofix format and lint
```

The `Makefile` wraps the same targets behind an install sentinel
(`node_modules/.install`), so `make test` reinstalls only when
`package-lock.json` moved.

Every pull request keeps `build`, `typecheck`, `lint` and `test` green.
`.github/workflows/validate.yml` runs them on Node 20, 22 and 24 — lint only on
24, because `oxlint.config.ts` needs native TypeScript loading — plus the
docs-drift check below.

## Which file a change opens

| Changing…                          | Open                                                                       |
| ---------------------------------- | -------------------------------------------------------------------------- |
| A diagnostic's severity or message | `packages/core/src/semantic/catalog.ts` — the only place either is written |
| The behaviour behind a code        | the rule family in `packages/core/src/semantic/rules/hfNxx.ts`             |
| A matcher, helper or faker fact    | `packages/core/src/registry/` — never inline the fact in a rule            |
| Hover or completion content        | `packages/core/src/contributions/` (its README carries the content policy) |
| Template parsing or analysis       | `packages/core/src/template/`                                              |
| What the server advertises         | `packages/server/src/capabilities.ts`                                      |
| How an editor finds the server     | the launcher under `editors/<editor>/`                                     |
| The bundled schema                 | `packages/core/src/schema/` and `schemas/` together, at a re-pinned commit |

## Adding a diagnostic

The five steps, in order — the last two are not optional, and CI enforces both:

1. Register the code in `packages/core/src/semantic/catalog.ts` with its
   severity, message template and href.
2. Emit it from a rule under `packages/core/src/semantic/rules/`, through
   `makeDiagnostic()` only, ranged at the smallest node the user must change.
   The full recipe is `packages/core/src/semantic/README.md`.
3. Add at least one `invalid/` fixture (and ideally a `valid/` counterpart) to
   `testdata/`, then regenerate its golden — see [03-testing.md](03-testing.md).
4. Add a focused unit test under `packages/core/test/semantic/`.
5. Add the code's trigger/range prose to `DIAGNOSTIC_PROSE` in
   `scripts/generate-diagnostic-docs.mjs` and regenerate the reference; the
   generator aborts loudly on a code with no prose entry.

Diagnostic codes are **append-only**: never reuse or repurpose one. A code's
meaning is a published contract ([01-architecture.md](01-architecture.md)).

## Regenerating the reference

`docs/reference/diagnostics.md` and `docs/reference/template-reference.md` are
projections of the built core package, not pages anyone writes. The diagnostics
table merges the runtime catalog (code, severity, message) with the trigger and
range prose carried in the generator; the template reference is projected from
`registry/helpers.ts` and `registry/faker.ts`.

```bash
npm run build            # the generator imports the BUILT dist, not the sources
npm run docs:diagnostics # rewrites both pages under docs/reference/
```

CI fails when the committed projection is stale — it regenerates and asserts
`git diff --quiet -- docs/` — so the regenerated files are committed alongside
the catalog or registry change that moved them.

## Where the answers live

This repository was not reverse-engineered from the Hoverfly documentation,
which is wrong in several places. It was built against the Hoverfly **Go
source** over two research rounds and then verified against a running instance,
and that trail is `research/`.

| Report                                | Answers                                                            |
| ------------------------------------- | ------------------------------------------------------------------ |
| `research/01-05`                      | format, source truth, LSP architecture, IDE integration, prior art |
| `research/06`                         | the gaps and contradictions round one surfaced                     |
| `research/07-09`                      | matcher value types, the templating spec, the Claude Code plugin   |
| `research/10-architect-decisions.md`  | the binding decisions D1–D9 — the tie-breaker                      |
| `research/11-diagnostic-catalog.md`   | the frozen `HFxxx` catalog spec                                    |
| `research/12-ground-truth-results.md` | importing every valid fixture into real Hoverfly v1.12.8           |

When a report disagrees with `research/10-architect-decisions.md`, that file
wins; a Go-source report outranks a docs-derived one. A behavioural change cites
the decision or report that motivates it, and ideally the Go source path, so the
provenance chain stays intact.

Decisions taken after this manual exists are recorded as ADRs in
[decisions/](decisions/).

## Where this repository diverges from the house preset

The `@jterrazz` conventions were followed wherever the monorepo shape allowed.
Four divergences are deliberate and each has a reason.

- **TypeScript config is local, not the house node preset.** `tsconfig.base.json`
  sets `NodeNext` module resolution, `strict`, `noUncheckedIndexedAccess` and
  `composite: true`, and the root `tsconfig.json` wires project references
  (`server` → `core`). Decision D1 requires core to compile and be consumed as a
  real project reference rather than through a bundler.
- **The build is `tsc --build`, the published bin is esbuild.** `tsc` keeps the
  reference graph honest and emits `.d.ts`; the bin is additionally bundled to a
  single CommonJS file (`dist/cli.cjs`), because `vscode-languageserver` and its
  protocol packages are CJS and a CJS bundle avoids interop shims.
- **CI is a plain workflow, not the reusable `validate.yaml`.** The house
  reusable runs one Node version and has no typecheck step; this repository needs
  the version matrix and the explicit stage.
- **`knip.json` declares entry points per workspace.** A workspace member's real
  entry is not its `main`, and a few dependencies are reached through configs
  rather than imports; both are declared there rather than silenced case by case.

## What a change owes

Four things land in the same commit as the change that makes them true:

- the regenerated golden for every fixture whose diagnostics moved,
- the regenerated `docs/reference/` projection,
- the chapter here that the change falsified,
- and, for a behavioural change, the citation of the decision or research report
  behind it.
