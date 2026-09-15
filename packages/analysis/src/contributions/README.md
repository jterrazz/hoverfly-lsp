# Hoverfly JSON contributions — hover & completion

This directory layers Hoverfly-specific IntelliSense on top of `vscode-json-languageservice` via
a single [`JSONWorkerContribution`](./hoverfly-contribution.ts). The schema engine handles
structure; this contribution supplies the context-sensitive hover and completion the bundled
schema cannot express (matcher names, cross-referenced state keys, settings-gated actions, and
templated-string IntelliSense driven from [`../service.ts`](../service.ts)).

All matcher facts come from the registry. The markdown renderers live in [`docs.ts`](./docs.ts)
and are SHARED between hover bodies and completion-item `documentation`, so the two never drift.

## Hover content policy

A matcher hover/completion describes **that matcher only**:

- its semantics + docs link (from the registry `docs` string),
- its accepted **value type**,
- its **config** support (neutral one-liner: `Config: supported …` / `Config: not supported.`),
- its **doMatch** behaviour (transform vs AND-semantics re-test),
- and notes **intrinsic to the matcher in hand** — nothing generic.

The generic "unknown matcher name panics" and "config on a non-array matcher panics" warnings are
**not** appended. They describe misuse the user is not committing while hovering a _valid_ matcher,
and the diagnostics own that messaging at the point the mistake is actually made:

| Misuse                            | Diagnostic that owns the panic message |
| --------------------------------- | -------------------------------------- |
| Unknown / misspelled matcher name | **HF201**                              |
| `config` on a non-`array` matcher | **HF204**                              |

Only matcher-specific ⚠️ notes are surfaced in hover/completion:

| Matcher  | Note (intrinsic to that matcher)                                      |
| -------- | --------------------------------------------------------------------- |
| `array`  | each `config` value must be a JSON boolean                            |
| `form`   | body-only, top-level-only, case-SENSITIVE (`form`, not `Form`/`FORM`) |
| `negate` | a non-string value matches vacuously (always true)                    |

## Completion coverage matrix

Cursor conditions mirror how real editors (VS Code / Zed) invoke completion:

- **(a) empty quotes** `"⟦⟧"` — cursor between two quotes (manual invoke, or the `"` trigger char)
- **(b) mid-word** `"au⟦⟧"` — a partial token already typed; the client filters items by prefix
- **(c) bare position** `{⟦⟧` / `[⟦⟧` — cursor before any quotes, right after `{` or `[`

A fourth editor dimension — **with vs without a trigger character** — does **not** change behaviour.
`doComplete` keys completions off the AST position, not off a `CompletionContext.triggerCharacter`;
a trigger character only _invokes_ completion, after which the same position logic runs. The server
advertises `"`, `{`, `.`, `#`, `@`, `'`, `(` as trigger characters (`capabilities.ts`) — exactly the
set that reaches these positions — so trigger-vs-manual is behaviourally identical.

| Context                                                                                            | (a) empty `""` | (b) mid-word | (c) bare `{`/`[` | Source hook                  |
| -------------------------------------------------------------------------------------------------- | -------------- | ------------ | ---------------- | ---------------------------- |
| Matcher name — `request.path` (non-body)                                                           | ✓              | ✓            | ✓                | `collectValueCompletions`    |
| Matcher name — `request.body` (adds `form`)                                                        | ✓              | ✓            | ✓                | `collectValueCompletions`    |
| Matcher name — `headers`/`query` maps, `doMatch` chains                                            | ✓              | ✓            | ✓                | `collectValueCompletions`    |
| `meta.schemaVersion`                                                                               | ✓              | ✓            | n/a¹             | `collectValueCompletions`    |
| `request.requiresState` **KEY**                                                                    | ✓              | ✓            | ✓²               | `collectPropertyCompletions` |
| `response.transitionsState` **KEY**                                                                | ✓              | ✓            | ✓²               | `collectPropertyCompletions` |
| `response.removesState` array entry                                                                | —              | —            | —                | **by design³**               |
| `response.postServeAction` (settings-gated)                                                        | ✓              | ✓            | n/a¹             | `collectValueCompletions`    |
| Template helper / faker / path (`Request.`/`State.`/`Vars.`/`Literals.`/`now`/`#each`/block close) | ✓              | ✓            | n/a⁴             | `service.ts` (offset-driven) |

¹ A scalar string value has no "bare object/array" position; (a)/(b) cover it. The bare value slot
(cursor right after `:` with no quotes) is also covered — `insertText` quotes the inserted value.

² At a bare `{` position the library passes `addValue = true`, so the inserted snippet is
`"<key>": "$1"` (key + value). At an empty-quotes position `addValue = false`, so only the quoted
key is inserted.

³ **removesState array string elements invoke no `JSONWorkerContribution` hook.**
`collectPropertyCompletions` fires only for object KEY positions (there is no object here) and
`collectValueCompletions` fires only for object property VALUES (it receives a `propertyKey`,
which a plain array element has none of). `vscode-json-languageservice` exposes no contribution
hook for a bare array-of-strings element, so cross-ref completion is not achievable here through
the contribution API. The state-key namespace is still complete elsewhere: removesState keys feed
the cross-reference union, they are just not _offered_ inside the removesState array itself.

⁴ Template completion is driven by the cursor offset in `service.ts` (the contribution API has no
offset), so its conditions are the mid-mustache states, not JSON quote/brace positions.

### State-key cross-reference (the originally-reported bug)

State keys are ONE namespace shared across the three places a pair touches state:
`requiresState` (consumer), `transitionsState` (producer), and `removesState` (eraser). The
cross-reference union now feeds from **all three** — see `collectStateKeys` in
[`hoverfly-contribution.ts`](./hoverfly-contribution.ts).

The bug: the union previously scanned `requiresState` entries only. A key set by a producer's
`transitionsState` (the overwhelmingly common "log in here → require auth there" flow) was invisible
when the user started typing it into another pair's `requiresState`, so they got **no completion**.
Including `transitionsState` and `removesState` keys in the union fixes it.

Tests: [`../../test/contributions/coverage-matrix.test.ts`](../../test/contributions/coverage-matrix.test.ts)
(per-context matrix), plus a real-server round-trip in
`packages/server/test/integration/lsp.test.ts`.
