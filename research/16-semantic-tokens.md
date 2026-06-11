# 16 — Semantic Tokens (editor-universal Hoverfly highlighting)

**Goal.** Color Hoverfly-specific constructs that a stock JSON grammar cannot reach — primarily
the Handlebars-subset template syntax living _inside_ templated response `body`/header strings, plus
matcher-name enum values. One LSP server emitting semantic tokens lights up VS Code, Zed, IntelliJ
(LSP4IJ), and Neovim with **zero per-editor config**, provided we pick _standard_ LSP token types
that the editors' default themes already color.

This report (a) pins the LSP 3.17 semantic-tokens wire format, (b) surveys editor + theme support so
we choose types that color out-of-the-box, and (c) **freezes the legend** (the ordered `tokenTypes[]`
array + the construct→type map) that the server must advertise verbatim.

---

## 1. LSP 3.17 semantic tokens — the wire format

Source: [LSP 3.17 specification — Semantic Tokens](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_semanticTokens),
cross-checked against [pygls "How to interpret semantic tokens"](https://pygls.readthedocs.io/en/latest/protocol/howto/interpret-semantic-tokens.html)
and [gopls semantic-tokens notes](https://go.googlesource.com/tools/+/refs/tags/v0.3.0/gopls/doc/semantictokens.md).

### 1.1 The legend

The server declares a `SemanticTokensLegend` in its `ServerCapabilities.semanticTokensProvider`:

```ts
interface SemanticTokensLegend {
  tokenTypes: string[]; // index → type name; the integer in slot 4 of each token indexes this
  tokenModifiers: string[]; // index → modifier name; a token's modifier bitset indexes these bits
}
```

The legend is an **ordered array**: the wire data carries _indices_ into `tokenTypes[]`, never names.
Server and client must agree on the order; the server publishes it once at registration and the
producer must emit indices consistent with that exact order. **This order is load-bearing for the
server phase — see §6.**

### 1.2 Delta (relative) encoding — 5 ints per token

`SemanticTokens.data` is a flat `uinteger[]`. Every token is **5 integers**, tokens sorted by
(line, startChar):

| slot   | meaning                                                                                                             |
| ------ | ------------------------------------------------------------------------------------------------------------------- |
| `5i+0` | `deltaLine` — token's line **minus the previous token's line** (absolute for the first token)                       |
| `5i+1` | `deltaStartChar` — start char **minus the previous token's start char** _when on the same line_; otherwise absolute |
| `5i+2` | `length` — token length **in UTF-16 code units** (matches the LSP default `PositionEncodingKind.UTF16`)             |
| `5i+3` | `tokenType` — index into `tokenTypes[]`                                                                             |
| `5i+4` | `tokenModifiers` — bitset; bit _k_ set ⇒ `tokenModifiers[k]` applies                                                |

Key rules that fall out of this and drive the producer design:

- **Tokens must be sorted** by (line, startChar) before delta-encoding — otherwise deltas go
  negative / wrong. Our producer returns an already-sorted absolute list; the _server_ does the
  delta-encoding (keeps core transport-free and testable).
- **A token may not span lines.** Each token is `(line, startChar, length)` on a single line. The
  producer must split (or, for template tokens which never legally contain a raw newline, assert)
  any token that would cross `\n`.
- Lengths are **UTF-16 code units**, which is exactly what `TextDocument.positionAt` / our
  source-map offsets already speak (the source map maps decoded UTF-16 code-unit offsets back to
  document offsets, surrogate pairs included). No re-measuring needed.

### 1.3 Requests: full / full-delta / range

- `textDocument/semanticTokens/full` — tokens for the whole document. (We implement this.)
- `textDocument/semanticTokens/full/delta` — diff against a previous result id. Optional; the server
  may decline (return `full` each time). Not needed for v1.
- `textDocument/semanticTokens/range` — tokens for a visible range only (large-file optimization).
  Optional. Our `getSemanticTokens` can be range-filtered by the server cheaply if desired, but v1
  returns the full set and lets the server slice.

Capability advertisement (server phase): `semanticTokensProvider = { legend, full: true }` (and
optionally `range: true`). Registration options carry the **same legend** the producer was built
against.

---

## 2. Editor + theme support — the crux (will a theme actually color it?)

A token type only produces color if the editor maps that type to a theme style. Custom types
(`hoverflyHelper`, …) color **nothing** until the user hand-writes theme rules — defeating the
"zero-config, universal" goal. So we restrict ourselves to **standard LSP token types** that ship
colored in default themes.

### 2.1 VS Code

Sources: [Semantic Highlight Guide](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide),
[Semantic Highlighting Overview (wiki)](https://github.com/microsoft/vscode/wiki/Semantic-Highlighting-Overview).

- `editor.semanticHighlighting.enabled` defaults to `"configuredByTheme"`, and **all themes that ship
  with VS Code (Dark+, Light+, etc.) enable semantic highlighting**. So out-of-the-box users get it.
- When a theme has no explicit `semanticTokenColors` rule for a token type, VS Code falls back to a
  **standard token-type → TextMate scope map**, then colors via the theme's normal `tokenColors`.
  Relevant standard mappings (from the guide's table):

  | LSP type     | TextMate scope fallback                             | colored by Dark+?                                                         |
  | ------------ | --------------------------------------------------- | ------------------------------------------------------------------------- |
  | `function`   | `entity.name.function`                              | yes                                                                       |
  | `variable`   | `variable.other.readwrite` / `entity.name.variable` | yes                                                                       |
  | `property`   | `variable.other.property`                           | yes                                                                       |
  | `parameter`  | `variable.parameter`                                | yes                                                                       |
  | `enumMember` | `variable.other.enummember`                         | yes                                                                       |
  | `namespace`  | `entity.name.namespace`                             | yes                                                                       |
  | `macro`      | `entity.name.function.preprocessor`                 | yes                                                                       |
  | `keyword`    | (keyword scopes)                                    | yes                                                                       |
  | `string`     | (string scopes)                                     | yes                                                                       |
  | `number`     | (number/constant scopes)                            | yes                                                                       |
  | `operator`   | (operator/punctuation scopes)                       | partial — **operator/punctuation is frequently uncolored** in many themes |

  Takeaway: `function/variable/property/parameter/enumMember/keyword/string/number/namespace/macro`
  are reliably colored. **`operator` is the weakest** — in Dark+ punctuation/operators often inherit
  the default foreground, so a token typed `operator` may look unstyled. We still use it for the
  `{{ }} # /` delimiters because it is semantically correct and themes that _do_ color operators
  (One Dark Pro, many community themes) will pick it up; nothing worse than "same as JSON text".

### 2.2 Zed

Sources: [Zed — Semantic Tokens docs](https://zed.dev/docs/semantic-tokens),
[PR #39539 "Add semantic tokens"](https://github.com/zed-industries/zed/pull/39539),
[issue #7450](https://github.com/zed-industries/zed/issues/7450).

- Zed **now consumes LSP semantic tokens** (landed late 2025 / shipped 2026). It maps standard LSP
  token types to its **theme syntax keys** via `global_lsp_settings.semantic_token_rules`, with
  built-in defaults (e.g. `function → function`, `variable → variable`, `keyword → keyword`,
  `property → property`, `string → string`, `number → number`, `enumMember → constant/enum`,
  `namespace → namespace`). Run `zed: show default semantic token rules` for the full table.
- **Caveat: Zed's semantic-tokens request is OFF by default** (`"off"`). A user must opt in
  (`semantic_tokens` setting). When opted in, our _standard_ types map onto Zed's syntax theme keys
  with no extra rules — which is the whole reason to prefer standard types. Custom types would map to
  nothing in Zed.
- Zed maps onto its tree-sitter syntax theme keys (`function`, `keyword`, `variable`, `property`,
  `string`, `number`, `constant`, `type`, `namespace`, …). Our chosen set lands on these keys. As in
  VS Code, `operator`/punctuation is the least consistently themed.

### 2.3 IntelliJ via LSP4IJ

Source: [LSP4IJ — semantic tokens support](https://github.com/redhat-developer/lsp4ij)
(LSP4IJ "User-defined Language Server" + semantic tokens; it maps LSP standard token types to
IntelliJ `TextAttributesKey`s). LSP4IJ supports `textDocument/semanticTokens` and ships a default
mapping from the standard LSP token types/modifiers to IntelliJ color keys, so `keyword/function/
string/number/property/namespace/parameter` color under the active IntelliJ theme without config.
`enumMember`/`macro` map to IntelliJ's enum/metadata attributes. Again standard types win.

### 2.4 Neovim

Built-in LSP client (`vim.lsp.semantic_tokens`) maps standard token types to `@lsp.type.<type>`
highlight groups, which default-link to Treesitter `@<group>` and thus to the colorscheme. Standard
types (`function`, `keyword`, `variable`, `property`, `string`, `number`, `parameter`, `namespace`,
`enumMember` → `@lsp.type.enumMember`) are colored by any Treesitter-aware colorscheme. Confirms the
same conclusion.

### 2.5 Conclusion

**Use only standard LSP token types.** The reliably-colored-everywhere set is:
`keyword, function, variable, property, parameter, enumMember, string, number, namespace, macro`.
`operator` is included for delimiters (semantically right; colored by many but not all themes — an
acceptable "degrades to plain JSON text" worst case). No custom types, no modifiers in v1.

---

## 3. FROZEN LEGEND

### 3.1 `tokenTypes[]` — the exact ordered array (server advertises verbatim)

```
0  namespace
1  keyword
2  function
3  variable
4  property
5  parameter
6  enumMember
7  string
8  number
9  operator
```

`tokenModifiers[] = []` (empty — no modifiers in v1; every token's modifier bitset is `0`).

This order is the contract. `SEMANTIC_TOKEN_TYPES` in `legend.ts` is this array; the server's
`SemanticTokensLegend.tokenTypes` must be the same array in the same order.

### 3.2 Construct → token type map (with justification)

| Hoverfly construct (in a templated string)                                                         | AST origin                                                                                 | token type                                                                             | why                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{{` `}}` `{{{` `}}}` mustache delimiters; `#` (block open) and `/` (block close) markers          | `MustacheNode` / `BlockNode` tag spans                                                     | `operator`                                                                             | punctuation/delimiters; `operator` is the standard "structural symbol" type. Worst case: plain text.                                                        |
| inline helper name (`now`, `faker`, `replace`, `concat`, subexpression head)                       | `MustacheNode.path` / `SubExpression.path` whose head is a known **inline** helper         | `function`                                                                             | a helper _call_; `function` colors everywhere.                                                                                                              |
| block-helper keyword (`if`, `unless`, `each`, `with`, `equal`, `first`)                            | `BlockNode.path` (or inline `log/lookup` which are builtins but inline → still `function`) | `keyword` for **block** builtins; control-flow reads as a keyword and colors strongly. |
| path root that is a Hoverfly context object (`Request`, `State`, `Vars`, `Literals`, `Journal`, …) | first segment of a `PathExpression` (not data, not thisRef, not a helper)                  | `variable`                                                                             | a value source; `variable` is the canonical "identifier you read".                                                                                          |
| subsequent path segments (`.Path`, `.Method`, `.QueryParam`, field names)                          | non-first string segments of a `PathExpression`                                            | `property`                                                                             | member access; `property` maps to `variable.other.property`.                                                                                                |
| `@index` / `@first` / `@last` / `@key` and `this`                                                  | `PathExpression` with `data:true` or `thisRef:true`                                        | `parameter`                                                                            | loop/context-injected vars; `parameter` (→ `variable.parameter`) reads as "special bound var", colored everywhere, visually distinct from plain `variable`. |
| string-literal argument (`'jsonpath'`, `'$.x'`, `''`)                                              | `StringLiteral` (when **not** a recognized faker type)                                     | `string`                                                                               | a literal string.                                                                                                                                           |
| numeric literal / bracket index (`[1]`, `10`, `-1.5`)                                              | `NumberLiteral`; bracket-index segment of a path                                           | `number`                                                                               | numerics; `[1]` index is a number-like selector.                                                                                                            |
| known `faker '<Type>'` type argument (`'Name'`, `'Email'`)                                         | `StringLiteral` that is the sole arg to the `faker` helper **and** ∈ `FAKER_NAMES`         | `enumMember`                                                                           | it is a value from a closed enum (the gofakeit name set) — `enumMember` is exactly "a named member of an enumeration".                                      |
| matcher-name value (`exact`, `regex`, `jwt`, `glob`, …)                                            | `MatcherModel.matcherNode` string value ∈ `REGISTRY_MATCHER_NAMES`/`MATCHER_SPECS`         | `enumMember`                                                                           | the matcher field is a closed enum of names; `enumMember` colors it distinctly from a plain JSON string.                                                    |

Notes / decisions:

- **`namespace` and `macro` are in the legend but unused in v1.** They are reserved (cheap to keep
  the order stable for a future "path root = namespace" or "side-effect helper = macro" refinement)
  and harmless to advertise. (If the server team prefers a minimal legend, they can drop trailing
  unused entries _as long as indices of used types do not shift_ — but freezing all 10 now avoids a
  legend renumber later. We keep them.)
- **Block builtins → `keyword`, inline builtins/Hoverfly helpers → `function`.** `if/each/with/
unless/equal/first` are control-flow blocks and read best as keywords; `now/faker/…/log/lookup`
  are calls and read as functions. The block-vs-inline split comes from `HelperSpec.block` in
  `registry/helpers.ts`.
- **`@data` vars and `this` → `parameter`** (not `variable`) to visually separate the
  loop-injected/context vars from real path roots. `parameter` is universally themed.
- **faker-type vs ordinary string** is the one context-sensitive call: only the first string arg of
  a `faker` mustache that is a known faker name becomes `enumMember`; everything else stays `string`.
  This is intentional polish (the user's example wants `'Name'` to read as an enum member).

---

## 4. Producer algorithm (implemented in `producer.ts`)

1. **Gate (D3 fingerprint).** If the document is not a Hoverfly simulation (`isHoverflySimulationAst`
   over the JSON AST) **and** the filename is not a Hoverfly name (`hasHoverflyFilename`), return
   `[]`. (Same gate the validation path uses; mirrors the HF5xx scope.)
2. **Template strings.** For every templatable string the HF5xx rule analyses — the response `body`
   and (when `templated===true`) header values, _plus_ any `body` that contains `{{` even when not
   templated (HF501 scope) — take the **raw JSON token** from the document, build the
   **escape-aware `createStringSourceMap(rawToken, node.offset)`** (the exact HF5xx machinery), `parse`
   the decoded template, walk the AST, and for each node emit tokens whose **decoded offsets are
   mapped to document offsets via `sourceMap.toDocOffset`**, then to `{line, char}` via
   `TextDocument.positionAt`. This is the credibility piece: `\n`/`\uXXXX`/surrogate escapes before a
   `{{…}}` land the token on the right document characters because the same source map the HF5xx
   diagnostics trust is reused.
3. **Matcher names.** For every matcher in the model (request fields incl. headers/query, and any
   nested via `doMatch` — v1 covers the top-level `matcherNode`), if `matcherName ∈ MATCHER_SPECS`
   names, emit an `enumMember` token over the _value_ span (inside the quotes) of `matcherNode`.
4. **Single-line invariant.** Each emitted token is clamped to its line: if a span would cross a
   newline it is split at line boundaries (template tokens never legally contain a raw `\n`, but the
   producer is defensive). Tokens are returned **sorted by (line, startChar)**.
5. **Never throw.** Malformed templates yield partial tokens (the parser is already error-tolerant);
   any unexpected node shape is skipped.

Return type (transport-free, server delta-encodes):

```ts
interface SemanticToken {
  line: number;          // 0-based
  startChar: number;     // 0-based, UTF-16 code units
  length: number;        // UTF-16 code units, single line
  tokenType: number;     // index into SEMANTIC_TOKEN_TYPES
  tokenModifiers: number; // bitset; always 0 in v1
}
getSemanticTokens(document, jsonDocument, model?): SemanticToken[]
```

`model` is optional; when omitted the producer builds it from `jsonDocument` (`buildSimulationModel`),
so the server can pass a cached model or nothing.

---

## 5. Files

- `packages/core/src/semantic-tokens/legend.ts` — `SEMANTIC_TOKEN_TYPES`, `SEMANTIC_TOKEN_MODIFIERS`,
  `SemanticTokenType` const map (name → index).
- `packages/core/src/semantic-tokens/producer.ts` — `getSemanticTokens`, `SemanticToken`.
- `packages/core/src/semantic-tokens/index.ts` — barrel.
- Re-exported from `packages/core/src/index.ts`.
- Tests: `packages/core/test/semantic-tokens/{legend,producer}.test.ts`.

---

## 6. What the SERVER phase must know

- **Advertise the legend verbatim and in order.** `SemanticTokensLegend.tokenTypes` MUST equal
  `SEMANTIC_TOKEN_TYPES` (import it; do not re-type the array) — index order is the wire contract.
  `tokenModifiers = SEMANTIC_TOKEN_MODIFIERS` (`[]`).
- **Capabilities:** `semanticTokensProvider = { legend, full: true }` (optionally `range: true`).
  Register `textDocument/semanticTokens/full`.
- **Delta-encode in the server.** Core returns an absolute, sorted `SemanticToken[]`; the server
  converts to the 5-int delta array (deltaLine/deltaStartChar relative to previous, length, type
  index, modifier bitset). The list is already sorted and single-line — just fold it.
- **No modifiers** in v1 (bitset always 0).
- Zed users must opt into semantic tokens (`semantic_tokens` setting `"on"`); VS Code / Neovim /
  IntelliJ-LSP4IJ color standard types out of the box. Nothing for the server to do here beyond
  advertising standard types — which the frozen legend already guarantees.

---

## Sources

- [LSP 3.17 specification — Semantic Tokens](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_semanticTokens)
- [pygls — How to interpret semantic tokens](https://pygls.readthedocs.io/en/latest/protocol/howto/interpret-semantic-tokens.html)
- [gopls — semantic tokens](https://go.googlesource.com/tools/+/refs/tags/v0.3.0/gopls/doc/semantictokens.md)
- [VS Code — Semantic Highlight Guide](https://code.visualstudio.com/api/language-extensions/semantic-highlight-guide)
- [VS Code wiki — Semantic Highlighting Overview](https://github.com/microsoft/vscode/wiki/Semantic-Highlighting-Overview)
- [Zed — Semantic Tokens](https://zed.dev/docs/semantic-tokens)
- [Zed PR #39539 — Add semantic tokens](https://github.com/zed-industries/zed/pull/39539)
- [Zed issue #7450 — Support LSP Semantic Tokens](https://github.com/zed-industries/zed/issues/7450)
- [LSP4IJ (redhat-developer)](https://github.com/redhat-developer/lsp4ij)
