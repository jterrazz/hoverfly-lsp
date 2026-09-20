# Developing

How a change is made here: the toolchain, the gates it must keep green, which
file a given change opens, and what it owes before it is committed.

## Setup

Node 24 (`.nvmrc` pins 24), npm workspaces, no other runtime. The published
server still runs on Node 20 — esbuild targets it — but the toolchain does not:
`@jterrazz/typescript` is the one devDependency and it asks for 24.

```bash
npm install            # or: make install (npm ci, lockfile-pinned)
npm run build          # tsc --build across analysis, server and the extension
npm test               # vitest --run
npm run typecheck      # tsc --build
npm run lint           # typescript check: tsc, oxlint, oxfmt, knip, artefacts, docs layout
npm run lint:fix       # autofix format and lint
```

The `Makefile` wraps the same targets behind an install sentinel
(`node_modules/.install`), so `make test` reinstalls only when
`package-lock.json` moved. Its `docs` target is the one gate the toolchain does
not carry — `make lint` runs it first, and the section below says what it
refuses.

Every pull request keeps `build`, `lint` and `test` green.
`.github/workflows/validate.yaml` calls the house reusable
(`jterrazz/jterrazz-actions`) on Node 24, which runs exactly
`make build && make lint && make test`. The build type-checks every member, so
no separate typecheck stage survives.

## Which file a change opens

| Changing…                          | Open                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------ |
| A diagnostic's severity or message | `packages/analysis/src/semantic/catalog.ts` — the only place either is written |
| The behaviour behind a code        | the matching rule family in `packages/analysis/src/semantic/rules/`            |
| A matcher, helper or faker fact    | `packages/analysis/src/registry/` — never inline the fact in a rule            |
| Hover or completion content        | `packages/analysis/src/contributions/` (its README carries the content policy) |
| Template parsing or analysis       | `packages/analysis/src/template/`                                              |
| What the server advertises         | `packages/server/src/capabilities.ts`                                          |
| How an editor finds the server     | the launcher under `editors/<editor>/`                                         |
| The bundled schema                 | `packages/analysis/src/schema/` and `schemas/` together, at a re-pinned commit |

## Adding a diagnostic

The five steps, in order — the last two are not optional, and CI enforces both:

1. Register the code in `packages/analysis/src/semantic/catalog.ts` with its
   severity, message template and href.
2. Emit it from a rule under `packages/analysis/src/semantic/rules/`, through
   `makeDiagnostic()` only, ranged at the smallest node the user must change.
   The full recipe is `packages/analysis/src/semantic/README.md`.
3. Add at least one `invalid/` fixture (and ideally a `valid/` counterpart) to
   `testdata/`, then regenerate its golden — see [03-testing.md](03-testing.md).
4. Add a focused unit test beside the rule, `packages/analysis/src/semantic/rules/<rule>.test.ts`.
5. Add the code's trigger/range prose to `DIAGNOSTIC_PROSE` in
   `scripts/generate-diagnostic-docs.mjs` and regenerate the reference; the
   generator aborts loudly on a code with no prose entry.

Diagnostic codes are **append-only**: never reuse or repurpose one. A code's
meaning is a published contract ([01-architecture.md](01-architecture.md)).

## Regenerating the reference

`docs/reference/diagnostics.md` and `docs/reference/template-reference.md` are
projections of the built analysis package, not pages anyone writes. The diagnostics
table merges the runtime catalog (code, severity, message) with the trigger and
range prose carried in the generator; the template reference is projected from
`registry/templating.ts` and `registry/faker.ts`.

```bash
npm run build            # the generator imports the BUILT dist, not the sources
npm run docs:diagnostics # rewrites both pages under docs/reference/
```

`make lint` fails when the committed projection is stale: its `docs` target
regenerates both pages and compares them with what the tree carries. The
regenerated files are committed alongside the catalog or registry change that
moved them.

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

- **`tsconfig.base.json` adds an emitting half to the house preset.** It extends
  `@jterrazz/typescript/tsconfig/node` and keeps only what the preset cannot
  know: this tree EMITS through `tsc --build` as project references (decision
  D1), so `composite`, `declaration`, `declarationMap`, `sourceMap` and
  `noEmit: false` live there — plus `allowJs: false`, which `isolatedDeclarations`
  requires of the published member. `packages/server` is that member and extends
  `@jterrazz/typescript/tsconfig/library` ahead of the base.
- **The build is `tsc --build`, the published bin is esbuild.** `tsc` keeps the
  reference graph honest and emits `.d.ts`; the bin is additionally bundled to a
  single CommonJS file (`dist/cli.cjs`), because `vscode-languageserver` and its
  protocol packages are CJS and a CJS bundle avoids interop shims.
- **`make lint` carries one gate of its own.** The reference under `docs/` is
  projected from the BUILT analysis package, and no pass of the toolchain regenerates it, so
  the `docs` target does — it is the one step the hand-rolled workflow had that
  the house reusable does not.
- **The prose gate does not read `research/`.** `npm run lint` passes
  `--ignore-pattern 'research/**'`: those sixteen reports are a dated record of
  two investigation rounds, quoting Hoverfly's Go source verbatim, and reflowing
  a transcript to a readability floor would falsify the record.
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
