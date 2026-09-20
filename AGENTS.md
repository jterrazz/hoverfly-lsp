# Agent brief — hoverfly-lsp

A language server for Hoverfly JSON simulation files: one pure analysis library,
one stdio server, four thin editor launchers. This file **routes**; the manual is
[docs/README.md](docs/README.md) and this page never restates it.

## Mental model

- **Dependency direction is one-way**: `editors → server → analysis`. `packages/analysis`
  carries no LSP transport dependency, and adding one is the regression to catch
  in review.
- **The catalog is the single source of truth.** A diagnostic's severity, message
  and href are written once in `packages/analysis/src/semantic/catalog.ts` and reach a
  rule only through `makeDiagnostic()`. Never inline a severity or a message.
- **Facts come from the registries, and the registries come from Go.** Matchers,
  helpers and faker types are transcribed from a pinned Hoverfly commit; a rule
  that hardcodes one has forked the truth.
- **Codes are a published API.** Append-only: never reuse or repurpose an `HFxxx`.
- **`testdata/` is the contract.** A `valid/` fixture must produce zero
  diagnostics; an `invalid/` fixture exactly its one code.
- **`docs/reference/` is generated.** It is projected from the built analysis library by
  `npm run docs:diagnostics`; editing it by hand is always wrong.

## Where knowledge lives (route here first)

| Working on…                                               | Read                                      |
| --------------------------------------------------------- | ----------------------------------------- |
| Layers, the analysis library's directories, the launchers | `docs/01-architecture.md`                 |
| The toolchain, and which file a change opens              | `docs/02-developing.md`                   |
| The suites, the corpus, regenerating goldens              | `docs/03-testing.md`                      |
| Releasing to npm and the extension registries             | `docs/04-operating.md`                    |
| The `HFxxx` catalog, helpers, faker types                 | `docs/reference/` (generated)             |
| Why a behaviour is what it is                             | `research/10-architect-decisions.md`      |
| Corpus conventions and per-domain counts                  | `testdata/README.md`                      |
| Adding a rule family; hover content policy                | the READMEs beside the code they describe |

## Commands

```bash
npm install            # or: make install
npm run build          # tsc --build across the workspaces, then the esbuild bundles
npm test               # vitest --run
npm run typecheck
npm run lint           # typescript check — the full gate
npm run lint:fix
npm run docs:diagnostics   # regenerate docs/reference/ (needs a build first)
env UPDATE_GOLDENS=1 npx vitest --run packages/analysis/specs/integration/semantic/golden.spec.ts
```

## Standing rules

- **Never edit a generated file.** `docs/reference/*` and
  `packages/analysis/src/schema/hoverfly.schema.generated.ts` come from their
  generators; change the source and regenerate.
- **A new code owes five things**, listed once in `docs/02-developing.md` under
  "Adding a diagnostic" — catalog entry, rule, fixture and golden, unit test,
  generator prose. CI fails on the last two being skipped.
- **Cite the decision.** A behavioural change names the `D1`–`D9` decision or the
  research report behind it, ideally with the Go source path.
