# Semantic rules — adding a rule family

A rule family lives in `rules/hfNxx.ts` and exports `HFNXX_RULES: readonly SemanticRule[]`.
Each `SemanticRule` is `{ codes, run(ctx) }` — `run` returns `Diagnostic[]` and MUST NOT throw.

1. Read everything from `ctx.model` (a typed, AST-anchored `SimulationModel` — see `types.ts`).
   Never re-walk the raw AST or hardcode matcher/helper facts; consume `../registry/*`.
2. Build diagnostics ONLY via `makeDiagnostic(ctx.textDocument, code, nodeOrRange, args)`
   (`diagnostics.ts`). Severity, message template, source, and docs href come from the frozen
   `catalog.ts` — never inline a severity or message string.
3. Range = the smallest node the user must change; pass the model's `*Node` directly.
4. Register: import your array in `rules/index.ts` and spread it into `ALL_RULES`.
5. Coverage (house rule): add a fixture `testdata/invalid/hfNxx/*.hoverfly.json` + run
   `UPDATE_GOLDENS=1 npx vitest --run packages/core/test/semantic/golden.test.ts` to emit the
   sibling `.diagnostics.golden`, AND a focused unit test under `test/semantic/`.

The engine runs all rules, re-tags schema diagnostics as HF102, suppresses schema noise that
overlaps an HF2xx node, and sorts by range — you only write `run`.
