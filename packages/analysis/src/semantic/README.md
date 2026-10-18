# Adding a semantic rule family

A rule family lives in `rules/hfNxx.ts` and exports `HFNXX_RULES: readonly SemanticRule[]`.
Each `SemanticRule` is `{ run(ctx) }`: `run` returns `Diagnostic[]` and MUST NOT throw.

1. Read everything from `ctx.model` (a typed, AST-anchored `SimulationModel`; see `rule.ts`).
   Never re-walk the raw AST or hardcode matcher/helper facts; consume `../registry/*`.
2. Build diagnostics ONLY via `makeDiagnostic(ctx.textDocument, code, nodeOrRange, args)`
   (`diagnostics.ts`). Severity, message template and source come from the frozen
   `catalog.data.ts`, the docs href from the code. Never inline a severity or message string.
3. Range = the smallest node the user must change; pass the model's `*Node` directly.
4. Register: import your array in `rules/families.ts` and spread it into `ALL_RULES`.
5. Coverage (house rule): add a fixture `testdata/invalid/hfNxx/*.hoverfly.json`, run
   `TEST_UPDATE=1 npm test` to record its sibling `<case>.diagnostics.json`, AND add the rule's
   rows to its family's table in `rules/__tests__/`.

The engine runs all rules, re-tags schema diagnostics as HF102, suppresses schema noise that
overlaps an HF2xx node, and sorts by range: you only write `run`.
