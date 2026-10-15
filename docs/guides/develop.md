# Developing

How a change is made here: the toolchain, the gates it must keep green, which
file a given change opens, and what it owes before it is committed.

## Setup

Node 24 (`.nvmrc` pins 24), npm workspaces, no other runtime. The published
server still runs on Node 20 — esbuild targets it — but the toolchain does not:
`@jterrazz/typescript` is the one devDependency and it asks for 24.

```bash
make install           # npm ci, lockfile-pinned, behind an install sentinel
make build             # every member: the analysis library, the server bin, the extension
make test              # build, then each member's vitest run
make lint              # build, regenerate docs/reference/, then typescript check
make fix               # typescript fix: format, autofixable lint, Markdown
make check             # lint, test and mutation: the whole verdict
```

`make test` reinstalls only when `package-lock.json` moved. The `docs` target
is the one gate the toolchain does not carry — `make lint` runs it first, and
the section below says what it refuses.

Every pull request keeps `build`, `lint`, `test` and `mutation` green.
`.github/workflows/validate.yaml` calls the house reusable
(`jterrazz/jterrazz-actions`) on Node 24, which runs `make build`, `make lint`
and `make test`, then `make mutation` over what changed since the base branch
(`TYPESCRIPT_MUTATION_SINCE`). A change therefore leaves no surviving mutant in
the lines it touches. Locally, `make check` on a clean tree measures only the
last commit, so before a branch is handed over, `npx typescript mutation --since
main` in each member it touched gives the verdict CI will give.

## Which file a change opens

| Changing…                          | Open                                                                                |
| ---------------------------------- | ----------------------------------------------------------------------------------- |
| A diagnostic's severity or message | `packages/analysis/src/semantic/catalog.data.ts` — the only place either is written |
| The behaviour behind a code        | the matching rule family in `packages/analysis/src/semantic/rules/`                 |
| A matcher, helper or faker fact    | `packages/analysis/src/registry/` — never inline the fact in a rule                 |
| Hover or completion content        | `packages/analysis/src/contributions/` (its README carries the content policy)      |
| Template parsing or analysis       | `packages/analysis/src/template/`                                                   |
| What the server advertises         | `packages/server/src/capabilities.ts`                                               |
| How an editor finds the server     | the launcher under `editors/<editor>/`                                              |
| The bundled schema                 | `packages/analysis/src/schema/` and `schemas/` together, at a re-pinned commit      |

## Adding a diagnostic

The five steps, in order — the last two are not optional, and CI enforces both:

1. Register the code in `packages/analysis/src/semantic/catalog.data.ts` with its
   severity and message template; its href is derived from the code.
2. Emit it from a rule under `packages/analysis/src/semantic/rules/`, through
   `makeDiagnostic()` only, ranged at the smallest node the user must change.
   The full recipe is `packages/analysis/src/semantic/README.md`.
3. Add at least one `invalid/` fixture (and ideally a `valid/` counterpart) to
   `testdata/`, then regenerate its golden — see [Test](test.md).
4. Add the rule's rows to its family's table under
   `packages/analysis/src/semantic/rules/__tests__/`.
5. Add the code's trigger/range prose to `DIAGNOSTIC_PROSE` in
   `scripts/diagnostic-prose.mjs` and regenerate the reference; the
   generator aborts loudly on a code with no prose entry.

Diagnostic codes are **append-only**: never reuse or repurpose one. A code's
meaning is a published contract ([Architecture](../concepts/architecture.md)).

## Regenerating the reference

`docs/reference/diagnostics.md` and `docs/reference/template-reference.md` are
projections of the built analysis package, not pages anyone writes. The diagnostics
table merges the runtime catalog (code, severity, message) with the trigger and
range prose carried in the generator; the template reference is projected from
`registry/templating.data.ts` and `registry/faker.ts`.

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
[decisions/](../decisions/).

## Where this repository diverges from the house preset

Each member declares its kind and platform in its own `jterrazz.config.ts`; the
root lists the members in `package.json`'s `workspaces`, declares no kind, and
keeps the few exceptions the toolchain cannot derive, each with its reason
beside it.

- **Two bundlers.** `packages/analysis` builds with `typescript build`, as a
  house library does. `packages/server` bundles its bin into one CommonJS file
  (`dist/cli.cjs`) with esbuild, because `vscode-languageserver` and its
  protocol packages are CJS and a single bundle avoids interop shims; the VS
  Code extension bundles the same way for the same reason.
- **`make lint` carries one gate of its own.** The reference under `docs/` is
  projected from the BUILT analysis package, and no pass of the toolchain
  regenerates it, so the `docs` target does.
- **The formatter and the Markdown pass leave four trees as written.**
  `schemas/upstream/`, `schemas/schemastore-submission/` and `testdata/` are
  compared byte for byte against something outside this tree, and `research/`
  quotes upstream source verbatim; the root configuration names why.
- **Members depend on each other by `*`.** npm workspaces have no `workspace:*`
  protocol, so `packages/server` names `@hoverfly-lsp/analysis` at `"*"` and npm
  links the workspace copy.
- **One entry knip cannot trace.** Claude Code runs
  `editors/claude-code/bin/launch.mjs` by the path its `.lsp.json` names.

## What a change owes

Four things land in the same commit as the change that makes them true:

- the regenerated golden for every fixture whose diagnostics moved,
- the regenerated `docs/reference/` projection,
- the chapter here that the change falsified,
- and, for a behavioural change, the citation of the decision or research report
  behind it.
