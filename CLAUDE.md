# The hoverfly-lsp agent brief

A language server for Hoverfly JSON simulation files: one pure analysis library,
one stdio server, four thin editor launchers. This file **routes**; the manual is
[docs/README.md](docs/README.md) and this page never restates it.

## Mental model

- **Dependency direction is one-way**: `editors` reach `server`, which reaches `analysis`. `packages/analysis`
  carries no LSP transport dependency, and adding one is the regression to catch
  in review.
- **The catalog is the single source of truth.** A diagnostic's severity and message
  are written once in `packages/analysis/src/semantic/catalog.data.ts` and reach a
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

| Working on                                                | Read                                      |
| --------------------------------------------------------- | ----------------------------------------- |
| Layers, the analysis library's directories, the launchers | `docs/concepts/architecture.md`           |
| The toolchain, and which file a change opens              | `docs/guides/develop.md`                  |
| The suites, the corpus, regenerating goldens              | `docs/guides/test.md`                     |
| Releasing to npm and the extension registries             | `docs/guides/release.md`                  |
| The `HFxxx` catalog, helpers, faker types                 | `docs/reference/` (generated)             |
| Why a behaviour is what it is                             | `research/10-architect-decisions.md`      |
| Corpus conventions and per-domain counts                  | `testdata/README.md`                      |
| Adding a rule family; hover content policy                | the READMEs beside the code they describe |

## Commands

```bash
make install           # npm ci, lockfile-pinned, behind an install sentinel
make build             # every member: the analysis library, the server bin, the extension
make test              # build, then typescript test: each member's vitest run, none on a proven tree
make lint              # build, regenerate docs/reference/, then typescript check
make fix               # typescript fix: format, autofixable lint, Markdown
make check             # lint, test and mutation: the whole verdict
TEST_UPDATE=1 make test # record the goldens a change moved; review each by hand
```

## Standing rules

- **Never edit a generated file.** `docs/reference/*` comes from its generator;
  change the source and regenerate.
- **A new code owes five things**, listed once in `docs/guides/develop.md` under
  "Adding a diagnostic": catalog entry, rule, fixture and golden, unit test,
  generator prose. CI fails on the last two being skipped.
- **Cite the decision.** A behavioural change names the decision (`D1` to `D9`) or the
  research report behind it, ideally with the Go source path.
