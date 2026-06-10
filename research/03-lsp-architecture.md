# hoverfly-lsp — LSP Architecture & Repository Design

Research-backed architecture recommendation for **hoverfly-lsp**: a production-quality Language Server for
Hoverfly simulation files (JSON), written in **TypeScript** (modern TS, ESM, Node runtime), distributed via
**npm with a `bin` entry**, and consumed by VS Code, Zed, IntelliJ, and headless Claude Code agents.

> Scope: **JSON Hoverfly simulation format only.** Hoverfly simulations are JSON documents (`{ "data": { "pairs": [...], "globalActions": {...} }, "meta": {...} }`) describing request matchers and mocked responses. We are _not_ building a general JSON LSP — we are building schema + semantic intelligence specialized to that format.

---

## 0. TL;DR — Headline Recommendations

1. **REUSE `vscode-json-languageservice` as the foundation.** Do not re-implement JSON parsing-with-recovery,
   JSON-Schema-driven validation, completion, or hover. It gives all of that out of the box, is the exact
   engine VS Code itself uses for JSON, and exposes clean extension points (`JSONWorkerContribution`,
   `getMatchingSchemas`, schema-injection via `schemaRequestService` + `configure`). This is precisely the
   "build on top" path that **yaml-language-server** and **azure-pipelines-language-server** took.
2. **Layer your own semantic ("type checking") pass on top of the schema engine**, exactly as
   yaml-language-server (modeline/k8s validators) and azure-pipelines (template/expression validators) do.
   Schema catches structural errors; your `packages/core` semantic analyzers catch _Hoverfly-specific_ rules
   (e.g. a matcher referencing an undefined `requestMatcher` type, duplicate exact-match pairs, regex that
   doesn't compile, `state`/`requiresState`/`transitionsState` consistency, template `{{ }}` references).
3. **Monorepo with a hard architectural boundary**: `packages/core` (pure analysis, **zero LSP/transport
   deps** — depends only on `vscode-json-languageservice` + `vscode-languageserver-types` for data types),
   `packages/server` (thin LSP/stdio wrapper), `editors/{vscode,zed,intellij}` (thin clients). This mirrors
   taplo (`taplo` crate vs `taplo-lsp` crate) and typescript-go (`internal/ls` vs `internal/lsp`).
4. **Testing pyramid**: corpus/fixture tests + golden/snapshot diagnostics at the core layer, cursor-marker
   (`|`/`$0`) completion & hover tests, and a small set of full stdio integration tests at the server layer.
5. **Packaging**: one npm package publishes the server with a `bin` (`hoverfly-lsp`); the VS Code extension is
   a separate `.vsix` that depends on / bundles the server; Zed gets a thin extension that `npx`/downloads the
   bin; IntelliJ uses LSP4IJ pointing at the bin.

---

## 1. The official LSP libraries (microsoft/vscode-languageserver-node)

Monorepo `microsoft/vscode-languageserver-node`. Folder-based layout (not npm workspaces historically — uses a
custom `npm run symlink` to link packages). TypeScript ~6.0.x, target ES2022, Node 22.x.

| Package                              | Current major | Role / API shape                                                                                                                                                                                                                                                     |
| ------------------------------------ | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vscode-jsonrpc`                     | **9.x**       | Low-level JSON-RPC message transport (the wire protocol between client/server). Rarely used directly.                                                                                                                                                                |
| `vscode-languageserver-types`        | **3.17.x**    | Pure data types: `Range`, `Position`, `Diagnostic`, `CompletionItem`, `Hover`, `TextEdit`, `MarkupContent`, `DiagnosticSeverity`. **Zero runtime deps.** This is what `packages/core` should depend on for return types.                                             |
| `vscode-languageserver-protocol`     | **3.18.x**    | Request/notification definitions on top of types + jsonrpc.                                                                                                                                                                                                          |
| `vscode-languageserver-textdocument` | **1.x**       | `TextDocument` implementation: `getText()`, `positionAt(offset)`, `offsetAt(position)`, incremental `update()`. Used by both core and server.                                                                                                                        |
| `vscode-languageserver`              | **10.x**      | Server framework: `createConnection`, `TextDocuments`, lifecycle (`onInitialize`, `onDidChangeConfiguration`), feature handlers (`onCompletion`, `onHover`, `connection.sendDiagnostics`). The `/node` subpath entry (`vscode-languageserver/node`) wires stdio/IPC. |
| `vscode-languageclient`              | **10.x**      | Client side, used **only** inside the VS Code extension to spawn/connect to the server.                                                                                                                                                                              |

Folder layout in the repo: `client/`, `server/`, `protocol/`, `jsonrpc/`, `types/`, `textDocument/`,
`client-node-tests/`.

**Minimal server skeleton** (the shape `packages/server` will take):

```ts
import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  InitializeResult,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

connection.onInitialize(
  (_params): InitializeResult => ({
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: { resolveProvider: true, triggerCharacters: ['"', ":"] },
      hoverProvider: true,
      documentSymbolProvider: true,
      // diagnostics are pushed via connection.sendDiagnostics OR pulled via diagnosticProvider
    },
  }),
);

documents.onDidChangeContent(async ({ document }) => {
  const diagnostics = await analyze(document); // <- delegates to packages/core
  connection.sendDiagnostics({ uri: document.uri, diagnostics });
});

connection.onCompletion((params) => complete(params)); // <- delegates to packages/core
connection.onHover((params) => hover(params)); // <- delegates to packages/core

documents.listen(connection);
connection.listen();
```

> Version note: pin `vscode-languageserver@^10`, `vscode-languageserver-textdocument@^1`,
> `vscode-languageserver-types@^3.17`. (yaml-language-server currently ships on `vscode-languageserver@^9` /
> `types ~3.17.5` — `10.x` is the current line and is the right choice for a greenfield project.)

---

## 2. CRITICAL: Build vs Reuse — `vscode-json-languageservice`

**Recommendation: REUSE.** Package `vscode-json-languageservice` is the JSON intelligence extracted from VS
Code itself; **current version 5.7.x** (Feb 2026), TypeScript, ESM+CJS. It provides:

- JSON parsing **with error recovery** (`parseJSONDocument` → `JSONDocument` with an AST you can walk even when
  the doc is malformed). Critical for live editing where the doc is usually half-typed.
- **JSON-Schema-driven** diagnostics, completion, and hover _for free_ once you register a schema.
- A clean **factory + configure** model and **extension points** for custom logic.

### 2.1 Public API (verbatim signatures, from `src/jsonLanguageService.ts`)

```ts
export function getLanguageService(params: LanguageServiceParams): LanguageService;

export interface LanguageService {
  configure(settings: LanguageSettings): void;
  doValidation(
    document: TextDocument,
    jsonDocument: JSONDocument,
    documentSettings?: DocumentLanguageSettings,
    schema?: JSONSchema,
  ): PromiseLike<Diagnostic[]>;
  parseJSONDocument(document: TextDocument): JSONDocument;
  newJSONDocument(
    rootNode: ASTNode | undefined,
    syntaxDiagnostics?: Diagnostic[],
    comments?: Range[],
  ): JSONDocument;
  resetSchema(uri: string): boolean;
  getMatchingSchemas(
    document: TextDocument,
    jsonDocument: JSONDocument,
    schema?: JSONSchema,
  ): PromiseLike<MatchingSchema[]>;
  getLanguageStatus(document: TextDocument, jsonDocument: JSONDocument): JSONLanguageStatus;
  doResolve(item: CompletionItem): PromiseLike<CompletionItem>;
  doComplete(
    document: TextDocument,
    position: Position,
    doc: JSONDocument,
  ): PromiseLike<CompletionList | null>;
  findDocumentSymbols(
    document: TextDocument,
    doc: JSONDocument,
    context?: DocumentSymbolsContext,
  ): SymbolInformation[];
  findDocumentSymbols2(
    document: TextDocument,
    doc: JSONDocument,
    context?: DocumentSymbolsContext,
  ): DocumentSymbol[];
  findDocumentColors(document, doc, context?): PromiseLike<ColorInformation[]>;
  getColorPresentations(document, doc, color, range): ColorPresentation[];
  doHover(document: TextDocument, position: Position, doc: JSONDocument): PromiseLike<Hover | null>;
  getFoldingRanges(document: TextDocument, context?: FoldingRangesContext): FoldingRange[];
  getSelectionRanges(document, positions, doc): SelectionRange[];
  findDefinition(document, position, doc): PromiseLike<DefinitionLink[]>;
  findLinks(document, doc): PromiseLike<DocumentLink[]>;
  format(document: TextDocument, range: Range | undefined, options: FormattingOptions): TextEdit[];
  sort(document: TextDocument, options: SortOptions): TextEdit[];
}
```

### 2.2 Configuration / extension-point types (verbatim, from `jsonLanguageTypes.ts`)

```ts
export interface LanguageServiceParams {
  schemaRequestService?: SchemaRequestService; // resolve schema URIs -> schema text
  workspaceContext?: WorkspaceContextService; // resolve relative $ref paths
  contributions?: JSONWorkerContribution[]; // <-- CUSTOM completion/hover injection
  promiseConstructor?: PromiseConstructor;
  clientCapabilities?: ClientCapabilities;
}

export interface SchemaRequestService {
  (uri: string): PromiseLike<string>;
}

export interface WorkspaceContextService {
  resolveRelativePath(relativePath: string, resource: string): string;
}

export interface LanguageSettings {
  validate?: boolean;
  allowComments?: boolean;
  schemas?: SchemaConfiguration[];
}

export interface SchemaConfiguration {
  uri: string;
  fileMatch?: string[]; // glob/file patterns -> which docs this schema applies to
  schema?: JSONSchema; // inline schema object (we'll inline the Hoverfly schema here)
  folderUri?: string;
}

export interface DocumentLanguageSettings {
  comments?: SeverityLevel; // 'error' | 'warning' | 'ignore'
  trailingCommas?: SeverityLevel;
  schemaValidation?: SeverityLevel;
  schemaRequest?: SeverityLevel;
  schemaDraft?: SchemaDraft;
}
```

### 2.3 The two custom-logic extension points we will actually use

**(a) `JSONWorkerContribution`** (from `src/jsonContributions.ts`) — injects custom hover + completion items
that are _AST-location aware_, without touching the schema:

```ts
export interface JSONWorkerContribution {
  getInfoContribution(uri: string, location: JSONPath): PromiseLike<MarkedString[]>;
  collectPropertyCompletions(
    uri: string,
    location: JSONPath,
    currentWord: string,
    addValue: boolean,
    isLast: boolean,
    result: CompletionsCollector,
  ): PromiseLike<any>;
  collectValueCompletions(
    uri: string,
    location: JSONPath,
    propertyKey: string,
    result: CompletionsCollector,
  ): PromiseLike<any>;
  collectDefaultCompletions(uri: string, result: CompletionsCollector): PromiseLike<any>;
  resolveCompletion?(item: CompletionItem): PromiseLike<CompletionItem>;
}

export interface CompletionsCollector {
  add(suggestion: JSONCompletionItem & { insertText: string }): void;
  error(message: string): void;
  setAsIncomplete(): void;
  getNumberOfProposals(): number;
}
```

> `JSONPath` is `(string | number)[]` — e.g. `['data','pairs', 0, 'request', 'matcher']`. This is how a
> contribution knows _where_ in the Hoverfly doc the cursor is and offers context-specific values (e.g. the
> list of valid matcher kinds: `exact`, `glob`, `json`, `jsonpath`, `regex`, `xml`, `xpath`, `jsonpartial`,
> `form`).

**(b) `getMatchingSchemas` + walking the `JSONDocument` AST** — for the _semantic_ validators that JSON Schema
can't express. `getMatchingSchemas` returns AST nodes paired with the sub-schema that matched, and the AST
nodes (`ASTNode` with `.offset`, `.length`, `.type`, `.children`) let you produce precise `Diagnostic` ranges.

### 2.4 Wiring sketch (the heart of `packages/core`)

```ts
import { getLanguageService, LanguageService, JSONDocument } from "vscode-json-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import { Diagnostic } from "vscode-languageserver-types";
import { hoverflySchema } from "./schema/hoverfly.schema.js"; // inlined JSON Schema (draft-07)
import { hoverflyContribution } from "./contributions/index.js"; // JSONWorkerContribution
import { semanticValidators } from "./semantic/index.js"; // our custom passes

const HOVERFLY_SCHEMA_URI = "hoverfly://schemas/simulation.json";

export function createHoverflyService(): HoverflyAnalysis {
  const json: LanguageService = getLanguageService({
    // serve our bundled schema in-memory; never hits the network
    schemaRequestService: (uri) =>
      uri === HOVERFLY_SCHEMA_URI
        ? Promise.resolve(JSON.stringify(hoverflySchema))
        : Promise.reject(new Error(`unknown schema ${uri}`)),
    contributions: [hoverflyContribution],
    clientCapabilities: ClientCapabilities.LATEST,
  });

  json.configure({
    validate: true,
    allowComments: false, // Hoverfly sims are strict JSON
    schemas: [{ uri: HOVERFLY_SCHEMA_URI, fileMatch: ["*"], schema: hoverflySchema }],
  });

  return {
    async diagnostics(doc: TextDocument): Promise<Diagnostic[]> {
      const parsed: JSONDocument = json.parseJSONDocument(doc);
      const schemaDiags = await json.doValidation(doc, parsed, { schemaValidation: "error" });
      const matches = await json.getMatchingSchemas(doc, parsed);
      const semanticDiags = semanticValidators.flatMap((v) => v(doc, parsed, matches));
      return [...schemaDiags, ...semanticDiags];
    },
    complete: (doc, pos) => json.doComplete(doc, pos, json.parseJSONDocument(doc)),
    hover: (doc, pos) => json.doHover(doc, pos, json.parseJSONDocument(doc)),
    symbols: (doc) => json.findDocumentSymbols2(doc, json.parseJSONDocument(doc)),
  };
}
```

**This is exactly the pattern yaml-language-server and azure-pipelines use** — see §3.

### 2.5 Why NOT build from scratch

- Error-recovering JSON parsing is genuinely hard; the library already does it and is battle-tested in VS Code.
- Schema validation (draft-04/07/2020-12 via embedded logic), `$ref` resolution, `oneOf`/`anyOf` best-match
  diagnostics, enum completions, and schema-driven hover docs are all free.
- The cost of reuse is small: ~1 dependency, and our semantic layer is additive, not a fork.

### 2.6 The one caveat

`vscode-json-languageservice` validates against JSON Schema but its error messages for `oneOf`/`anyOf` can be
noisy (it reports the union failure rather than the specific branch). Our semantic layer should, where a
Hoverfly construct is a discriminated union (e.g. matcher entries), **pre-narrow on a discriminator** and emit
a clearer diagnostic, optionally suppressing the schema's union noise via `documentSettings`.

---

## 3. How others build semantics on top (precedents)

### 3.1 redhat-developer/yaml-language-server

- Depends on **`vscode-json-languageservice@4.1.8`**, `vscode-languageserver@^9`,
  `vscode-languageserver-textdocument@^1`, `vscode-languageserver-types@~3.17.5`, `vscode-uri@^3`,
  `yaml@2.8.x` (eemeli/yaml parser), `ajv@^8`, `jsonc-parser`, `prettier`, `request-light` (schema fetch).
- Source layout: `src/languageservice/` (the reusable service) and `src/languageserver/` (the LSP wrapper).
- Under `src/languageservice/`:
  - `yamlLanguageService.ts` — **orchestrator** (the analogue of our `createHoverflyService`).
  - `parser/` — YAML→AST, producing a JSON-document-shaped structure.
  - `services/` — one file per LSP feature:
    `yamlValidation.ts`, `yamlCompletion.ts`, `yamlHover.ts`, `yamlSchemaService.ts`, `yamlDefinition.ts`,
    `yamlLinks.ts`, `documentSymbols.ts`, `yamlFolding.ts`, `yamlFormatter.ts`, `yamlCodeActions.ts`,
    `yamlCodeLens.ts`, `yamlOnTypeFormatting.ts`, `yamlRename.ts`, `yamlSelectionRanges.ts`.
  - `utils/` — `modelineUtil.ts` (parses `# yaml-language-server: $schema=...` directives),
    `k8sSchemaUtil.ts` (Kubernetes group/version/kind → schema), etc.
- **Semantics beyond schema**: schema priority resolution
  (`Modeline > CustomSchemaProvider API > yaml.schemas > Schema Store`), custom-tag handling
  (`yaml.customTags`), K8s-specific schema selection — i.e. logic that _chooses and augments_ the schema and
  adds domain validation the schema can't express. **Takeaway for us**: keep a thin per-feature service file
  layout and a dedicated `schemaService`-like module even though we have exactly one schema.

### 3.2 microsoft/azure-pipelines-language-server

- **Forked from** yaml-language-server. Two packages: `azure-pipelines-language-service` (reusable) and
  `azure-pipelines-language-server` (LSP wrapper, depends on the service). Dev loop uses `npm link` between them.
- **Semantics beyond schema**: detects _missing nodes, invalid key types, incorrect node types, invalid
  child relationships, and additional-property warnings_, plus **template resolution** and Azure-Pipelines
  structural validation, plus **expression** (`${{ }}`) checking. This is the strongest precedent for our
  "type checking" requirement: schema for shape, custom walkers for cross-field and reference rules.
  **Takeaway for us**: the service/server two-package split + a custom validation module that walks the AST
  and emits domain diagnostics is the proven recipe.

---

## 4. Repo-organization patterns: taplo & typescript-go

### 4.1 tamasfe/taplo (TOML) — `crates/`

- `taplo` — **pure parser + analysis library** (rowan-based syntax tree, DOM, schema validation). No LSP.
- `taplo-common` — shared utilities across CLI/LSP.
- `taplo-lsp` — **LSP server** built on `lsp-async-stub`; depends on `taplo` + `taplo-common`.
- `lsp-async-stub` — async LSP transport helper (their thin protocol shim).
- `taplo-cli` — CLI front-end (formatting, linting) reusing `taplo`.
- `taplo-wasm` — WASM bindings.
- Distribution: `cargo` for the Rust binary **and** npm packages — notably **`@taplo/lsp`** (current 0.8.0), a
  JS/WASM wrapper exposing the language server generically (callback-based, runs in browser/web-worker/Node).
- **Boundary lesson**: the pure analysis crate (`taplo`) has _zero_ LSP knowledge; `taplo-lsp` translates
  between LSP requests and `taplo` analysis calls. This is the exact `packages/core` ↔ `packages/server` line
  we want.

### 4.2 microsoft/typescript-go (tsgo) — `cmd/` + `internal/`

- `cmd/tsgo` — binary entry point.
- `internal/` — everything, including:
  - `internal/ls` — **the pure language service / analysis layer** (completions, hover, find-references built
    on the compiler) — _editor-agnostic, no protocol_.
  - `internal/lsp` — **the LSP protocol layer** (decodes JSON-RPC, maps to `ls` calls, encodes responses).
  - `internal/jsonrpc` — transport.
  - plus `parser`, `scanner`, `binder`, `checker`, `ast`, `compiler`, `vfs`, `project`, `fourslash`
    (their cursor-marker test framework), `testrunner`, `testutil`, `format`, `json`.
- `_extension/` — VS Code extension; `_packages/native-preview` — preview npm package; `testdata/` —
  fixtures + baselines; `_submodules/` — the upstream TypeScript test suite as a git submodule.
- **Boundary lesson**: `internal/ls` (analysis) vs `internal/lsp` (protocol) is the canonical split. tsgo even
  keeps its cursor-marker test harness (`fourslash`) in the analysis layer, validating analysis _without_ the
  protocol — directly informing our test strategy (§6).

---

## 5. Recommended repo layout for hoverfly-lsp

A **pnpm/npm workspaces monorepo**. The non-negotiable rule: `packages/core` has **zero LSP/transport
dependencies** (only `vscode-json-languageservice` + `vscode-languageserver-types` for return data types).

```
hoverfly-lsp/
├─ package.json                      # workspaces root, private:true
├─ pnpm-workspace.yaml               # (or "workspaces" field) packages/*, editors/vscode
├─ tsconfig.base.json                # strict, ESM, NodeNext moduleResolution, ES2022 target
├─ .changeset/                       # versioning (Changesets) — see §8
├─ packages/
│  ├─ core/                          # @hoverfly-lsp/core — PURE ANALYSIS, no LSP transport
│  │  ├─ package.json                # deps: vscode-json-languageservice, vscode-languageserver-types,
│  │  │                              #       vscode-languageserver-textdocument  (NO vscode-languageserver)
│  │  ├─ src/
│  │  │  ├─ index.ts                 # createHoverflyService() factory (the §2.4 sketch)
│  │  │  ├─ service.ts               # wires getLanguageService + configure
│  │  │  ├─ schema/
│  │  │  │  ├─ hoverfly.schema.ts    # the inlined JSON Schema (draft-07) as a TS const
│  │  │  │  └─ hoverfly.schema.json  # canonical artifact (also published for external use)
│  │  │  ├─ semantic/                # <-- "type checking" beyond schema
│  │  │  │  ├─ index.ts              # SemanticValidator[] registry
│  │  │  │  ├─ matcher-kinds.ts      # matcher type must be one of the known kinds
│  │  │  │  ├─ regex-compiles.ts     # regex/glob matchers must compile
│  │  │  │  ├─ duplicate-pairs.ts    # detect conflicting/duplicate exact matchers
│  │  │  │  ├─ state-consistency.ts  # requiresState/transitionsState/removesState coherence
│  │  │  │  ├─ template-refs.ts      # {{ Request.* }} / data-source template validation
│  │  │  │  └─ types.ts              # SemanticValidator = (doc, jsonDoc, matches) => Diagnostic[]
│  │  │  ├─ contributions/
│  │  │  │  └─ index.ts              # JSONWorkerContribution: enum/value completions + hover docs
│  │  │  ├─ ast/
│  │  │  │  └─ nav.ts                # ASTNode helpers: findNodeAtPath, rangeOf(node), jsonPathOf(node)
│  │  │  └─ docs/
│  │  │     └─ field-docs.ts         # hover markdown per JSONPath (matcher kinds, response fields...)
│  │  └─ test/
│  │     └─ ...                      # see §6
│  └─ server/                        # @hoverfly-lsp/server — THIN LSP WRAPPER (the npm bin)
│     ├─ package.json                # bin: { "hoverfly-lsp": "./bin/hoverfly-lsp.js" }
│     │                              # deps: @hoverfly-lsp/core, vscode-languageserver,
│     │                              #       vscode-languageserver-textdocument
│     ├─ bin/
│     │  └─ hoverfly-lsp.js          # #!/usr/bin/env node  → import('../dist/cli.js')
│     ├─ src/
│     │  ├─ cli.ts                   # arg parsing: --stdio (default) | --node-ipc | --socket
│     │  ├─ server.ts                # createConnection, TextDocuments, onInitialize, handlers
│     │  └─ capabilities.ts          # InitializeResult capability object
│     └─ test/
│        └─ integration/             # full stdio round-trip tests (see §6.4)
├─ editors/
│  ├─ vscode/                        # the .vsix; client only
│  │  ├─ package.json                # contributes.languages + activationEvents; bundles server
│  │  ├─ src/extension.ts            # LanguageClient spawning the server bin over stdio
│  │  ├─ language-configuration.json
│  │  └─ .vscodeignore
│  ├─ zed/                           # Zed extension (Rust/TOML manifest) that launches the bin via npx
│  │  ├─ extension.toml
│  │  └─ src/hoverfly.rs             # context_server / lsp adapter resolving the npm bin
│  └─ intellij/                      # LSP4IJ-based plugin pointing at the bin
│     ├─ build.gradle.kts
│     └─ src/main/...
├─ testdata/                         # SHARED CORPUS (see §6.1) — consumed by core tests
│  ├─ valid/
│  ├─ invalid/
│  ├─ completion/
│  └─ hover/
└─ scripts/                          # release, schema-export, bundle
```

**Dependency direction (enforced, e.g. via `eslint-plugin-import` / dependency-cruiser):**
`editors/* → packages/server → packages/core → (vscode-json-languageservice, *-types)`.
Never the reverse. `packages/core` must be importable and testable with **no LSP connection**.

---

## 6. Testing pyramid (concrete layouts)

Tiered, with the bulk of tests at the **core** layer (fast, no transport), mirroring tsgo's `fourslash`
(analysis-level cursor tests) and yaml-language-server's mocha-over-fixtures approach.

Recommended runner: **Vitest** (ESM-native, snapshot support, fast watch). yaml-language-server uses
mocha+chai+sinon+nyc; for a greenfield ESM TS project Vitest is the cleaner choice (built-in `toMatchSnapshot`,
no ts-node/register dance).

```
                  ▲  few   editors/* manual + 1 smoke   (VS Code @vscode/test-electron, optional)
                 ╱ ╲
                ╱   ╲  some  packages/server integration over real stdio (JSON-RPC round trips)
               ╱─────╲
              ╱       ╲ many packages/core unit + golden + cursor tests over testdata/ corpus
             ╱─────────╲
```

### 6.1 Corpus / fixture layout (`testdata/`)

```
testdata/
├─ valid/                            # must produce ZERO diagnostics
│  ├─ minimal.json
│  ├─ exact-matchers.json
│  ├─ stateful-simulation.json
│  └─ templated-response.json
├─ invalid/                          # each .json has a sibling .golden of expected diagnostics
│  ├─ unknown-matcher-kind.json
│  ├─ unknown-matcher-kind.golden    # serialized Diagnostic[] (range+severity+message+code)
│  ├─ bad-regex.json
│  ├─ bad-regex.golden
│  ├─ missing-meta-schemaversion.json
│  └─ missing-meta-schemaversion.golden
├─ completion/                       # cursor-marker files (see §6.3)
│  ├─ matcher-kind.json              # contains the |  cursor marker
│  ├─ matcher-kind.expected          # expected completion labels (ordered or as a set)
│  └─ response-status.json
└─ hover/
   ├─ matcher-kind.json              # cursor marker on a "matcher" value
   └─ matcher-kind.expected.md       # expected hover markdown
```

### 6.2 Golden / snapshot diagnostics tests (core)

```ts
// packages/core/test/diagnostics.golden.test.ts
import { readFileSync } from "node:fs";
import { glob } from "glob";
import { test, expect } from "vitest";
import { createHoverflyService } from "../src/index.js";
import { TextDocument } from "vscode-languageserver-textdocument";

const svc = createHoverflyService();

for (const file of await glob("testdata/invalid/*.json")) {
  test(`diagnostics: ${file}`, async () => {
    const doc = TextDocument.create(`file://${file}`, "json", 1, readFileSync(file, "utf8"));
    const diags = await svc.diagnostics(doc);
    // normalize to {line,char,severity,code,message}; compare to the .golden file
    await expect(serialize(diags)).toMatchFileSnapshot(file.replace(/\.json$/, ".golden"));
  });
}

for (const file of await glob("testdata/valid/*.json")) {
  test(`no diagnostics: ${file}`, async () => {
    const doc = TextDocument.create(`file://${file}`, "json", 1, readFileSync(file, "utf8"));
    expect(await svc.diagnostics(doc)).toEqual([]);
  });
}
```

Golden files are committed; regeneration via `vitest -u`. Keep the serialization stable
(`L{line}:{char}-{endLine}:{endChar} [{severity}] {code}: {message}`) so diffs are reviewable.

### 6.3 Cursor-marker completion & hover tests (core)

Adopt a single-character marker convention. **Recommendation: `█` or `$0`** (avoid `|` since it's a valid JSON
string char and could appear in data; `$0` is the LSP snippet convention and is unambiguous in JSON when used
as a fixture-only sentinel). The harness:

```ts
// strip the marker, record its offset, run doComplete at that Position
function withCursor(src: string): { text: string; pos: Position } {
  /* find '$0', splice it out */
}

test("completes matcher kinds", async () => {
  const file = readFileSync("testdata/completion/matcher-kind.json", "utf8");
  const { text, pos } = withCursor(file);
  const doc = TextDocument.create("file://t.json", "json", 1, text);
  const list = await svc.complete(doc, pos);
  const labels = list!.items.map((i) => i.label).sort();
  expect(labels).toEqual([
    "exact",
    "form",
    "glob",
    "json",
    "jsonpartial",
    "jsonpath",
    "regex",
    "xml",
    "xpath",
  ]);
});
```

This is the analogue of tsgo's `fourslash` and the classic VS Code `/*$0*/` marker tests — **completion is
verified at the analysis layer, not over the wire.**

### 6.4 Full server integration tests (server, over stdio)

A handful only: spawn the built `bin/hoverfly-lsp.js` as a child process, drive it with `vscode-jsonrpc`,
assert real `initialize`, `textDocument/didOpen` → `publishDiagnostics`, `textDocument/completion`,
`textDocument/hover` round-trips. This proves the protocol wiring and `bin` shebang work end-to-end.

```ts
// packages/server/test/integration/stdio.test.ts
const child = spawn(process.execPath, ["bin/hoverfly-lsp.js", "--stdio"]);
const conn = createMessageConnection(
  new StreamMessageReader(child.stdout),
  new StreamMessageWriter(child.stdin),
);
conn.listen();
await conn.sendRequest("initialize", { capabilities: {}, rootUri: null, processId: process.pid });
// didOpen an invalid sim, await a publishDiagnostics notification, assert codes...
```

### 6.5 Editor smoke (optional, lowest priority)

- VS Code: `@vscode/test-electron` launching the extension against a fixture workspace (1 smoke test).
- Zed/IntelliJ: manual verification + a documented checklist; not in CI initially.

---

## 7. Packaging & distribution

### 7.1 npm — the server (primary artifact, headless-friendly for Claude Code)

- Publish **`@hoverfly-lsp/server`** (or unscoped `hoverfly-lsp`) with:
  ```jsonc
  {
    "name": "hoverfly-lsp",
    "type": "module",
    "bin": { "hoverfly-lsp": "./bin/hoverfly-lsp.js" },
    "engines": { "node": ">=18" },
    "files": ["bin", "dist"],
    "dependencies": {
      "@hoverfly-lsp/core": "workspace:*",
      "vscode-languageserver": "^10",
      "vscode-languageserver-textdocument": "^1",
    },
  }
  ```
- `bin/hoverfly-lsp.js` is a tiny ESM shim with `#!/usr/bin/env node` that imports the built `dist/cli.js`.
- Default transport **stdio** (`--stdio`), also support `--node-ipc` and `--socket=<port>` like
  yaml-language-server. Claude Code agents and any editor can then run `npx hoverfly-lsp --stdio`.
- Bundle the server (and `core`) with **esbuild/tsup** into a single `dist/cli.js` so the published package has
  no `node_modules` surprise and starts fast. yaml-language-server ships both CJS (`out/`) and UMD/ESM
  (`lib/`) builds; for us, an ESM-only bundle + the `bin` is sufficient.

### 7.2 `.vsix` — VS Code extension

- Separate package `editors/vscode`. Use `@vscode/vsce package` to build the `.vsix`, `vsce publish` to the
  Marketplace, and optionally `ovsx publish` for Open VSX.
- `package.json` declares `contributes.languages` (associate `*.json` under a Hoverfly file pattern, or a
  command/`when` activation), `activationEvents`, and bundles the server output so the extension is
  self-contained (no runtime `npm install`).
- `extension.ts` uses `vscode-languageclient/node` `LanguageClient` with a `ServerOptions` pointing at the
  bundled `dist/cli.js` over stdio.

### 7.3 Zed

- Zed extension (`extension.toml` + small Rust) that registers a language server and resolves the binary via
  `npx hoverfly-lsp` (or downloads a pinned version). Thin — all intelligence stays in the npm server.

### 7.4 IntelliJ

- Plugin using **LSP4IJ** (Red Hat's generic LSP client for IntelliJ) configured to launch
  `npx hoverfly-lsp --stdio`. No Java analysis logic — pure client.

### 7.5 Versioning / release

- **Changesets** at the monorepo root for SemVer + changelog generation across `core`, `server`, and the
  VS Code extension. CI: on tag, build → test → `npm publish` (server + core) and `vsce publish` (vsix).
- Keep `core` and `server` version-locked at first (publish together) to avoid drift; the editor extensions
  pin a server version range.
- Mirror microsoft/\* toolchain choices: TypeScript ^5.5+ (or 6.x), target ES2022, `moduleResolution: NodeNext`,
  `strict: true`.

---

## 8. Concrete next-step checklist for implementation agents

1. Author `packages/core/src/schema/hoverfly.schema.json` (draft-07) from the Hoverfly simulation spec:
   top-level `data.pairs[].{request,response}`, `data.globalActions.delays[]`, `meta.{schemaVersion,
hoverflyVersion,timeExported}`. Encode matcher entries as a discriminated array of
   `{matcher: enum, value, config?}`.
2. Implement `createHoverflyService` per §2.4; serve the schema in-memory via `schemaRequestService`.
3. Implement `SemanticValidator[]` in `packages/core/src/semantic/` (matcher kinds, regex/glob compile,
   duplicate/conflicting matchers, state coherence, template `{{ }}` refs) using `getMatchingSchemas` +
   AST navigation for precise ranges. Assign stable diagnostic `code`s (e.g. `HF001`…) for golden tests.
4. Implement `JSONWorkerContribution` for value completions (matcher kinds, HTTP methods, status codes) and
   hover docs keyed by `JSONPath`.
5. Stand up `packages/server` with the §1 skeleton; wire `onCompletion/onHover/onDocumentSymbol/diagnostics`
   to `core`; ship the `bin`.
6. Build the `testdata/` corpus and the Vitest golden + cursor-marker harnesses (§6).
7. Wrap VS Code (`.vsix`), Zed, IntelliJ as thin clients; set up Changesets + CI publish.

---

## 9. Source URLs (for implementers)

- LSP libs monorepo: https://github.com/microsoft/vscode-languageserver-node
  (`vscode-languageserver`@10, `vscode-jsonrpc`@9, `vscode-languageserver-protocol`@3.18,
  `vscode-languageserver-types`@3.17, `vscode-languageserver-textdocument`@1)
- JSON language service: https://github.com/microsoft/vscode-json-languageservice (npm `vscode-json-languageservice`@5.7.x)
  - API: `src/jsonLanguageService.ts`, `src/jsonLanguageTypes.ts`, `src/jsonContributions.ts`, `src/example/sample.ts`
- yaml-language-server: https://github.com/redhat-developer/yaml-language-server
  (`src/languageservice/` + `src/languageserver/`; deps include `vscode-json-languageservice@4.1.8`)
- azure-pipelines-language-server: https://github.com/microsoft/azure-pipelines-language-server
  (two packages: `azure-pipelines-language-service` + `azure-pipelines-language-server`; forked from yaml-language-server)
- taplo: https://github.com/tamasfe/taplo (`crates/{taplo,taplo-common,taplo-lsp,taplo-cli,taplo-wasm,lsp-async-stub}`;
  npm `@taplo/lsp`@0.8.0: https://www.npmjs.com/package/@taplo/lsp ; docs https://taplo.tamasfe.dev/lib/javascript/lsp.html)
- typescript-go: https://github.com/microsoft/typescript-go
  (`cmd/tsgo`, `internal/ls` = analysis, `internal/lsp` = protocol, `internal/fourslash` = cursor-marker tests, `testdata/`)
