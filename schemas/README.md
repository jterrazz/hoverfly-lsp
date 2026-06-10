# Hoverfly simulation JSON Schema

This directory holds the **standalone, publishable JSON Schema** for [Hoverfly](https://hoverfly.io)
v5 simulation files, plus the baselines the drift CI uses to know when upstream Hoverfly moves.

| File                                                               | What it is                                                                                                                                                                                                          |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`hoverfly-simulation.json`](./hoverfly-simulation.json)           | The publishable schema (JSON Schema draft-07). This is what you point editors at and what we submit to SchemaStore.                                                                                                 |
| [`upstream-baseline.schema.json`](./upstream-baseline.schema.json) | A **verbatim copy** of Hoverfly's official `core/handlers/v2/schema.json` at the pinned `HOVERFLY_COMMIT`. The drift job diffs live upstream against this.                                                          |
| [`upstream-source-hashes.json`](./upstream-source-hashes.json)     | SHA-256 of the Go source files our matcher registry (research/07) and templating spec (research/08) were transcribed from. The drift job re-hashes them to detect behavioural drift the schema alone wouldn't show. |

## What `hoverfly-simulation.json` is

It is an **enhanced but faithful superset** of Hoverfly's official schema: it adds titles,
descriptions, default snippets, and matcher-name examples, but it is **never stricter** than
what Hoverfly accepts at import. It is byte-identical to the LSP's bundled schema
(`packages/core/src/schema/hoverfly.schema.json`) except for two documented deltas:

1. **`$id`** is set to the future SchemaStore URL `https://json.schemastore.org/hoverfly-simulation.json`
   (the bundled LSP schema uses an internal `hoverfly-lsp.dev` URL).
2. **`definitions.field-matchers.properties.matcher.examples`** re-adds the 14 matcher names
   (`exact`, `negate`, `glob`, `regex`, `xml`, `xmltemplated`, `xpath`, `json`, `jsonpartial`,
   `jsonpath`, `jwt`, `jwtjsonpath`, `array`, `form`). The bundled schema omits them because the
   LSP's completion contribution owns matcher-name completion (and gates `form` to the request
   body); schema-only consumers have no such contribution, so they need the examples here.

A test (`packages/core/test/schema/schemastore-artifact.test.ts`) asserts this relationship so
the artifact and the bundle can never drift apart silently.

> The `matcher` field is intentionally a free `string` (not an `enum`). Hoverfly's matcher
> lookup is forward-compatible and case-insensitive; the examples are completion hints, not a
> closed set. Strict unknown-matcher checking is an LSP-only semantic feature.

## How to use it today (before SchemaStore lists it)

Name your simulation files `*.hoverfly.json` (or `hoverfly-simulation.json`) — that is the
convention this schema and the LSP promote.

### Self-declare with `$schema` (works everywhere)

Add a `$schema` key at the top of the file (this is non-standard for Hoverfly but harmless —
Hoverfly ignores unknown top-level keys at the JSON layer, and the LSP's content fingerprint
still recognises the file):

```jsonc
{
  "$schema": "https://json.schemastore.org/hoverfly-simulation.json",
  "data": { "pairs": [] },
  "meta": { "schemaVersion": "v5.3" },
}
```

Until the SchemaStore submission lands you can point `$schema` at the raw file in this repo:
`https://raw.githubusercontent.com/jterrazz/hoverfly-lsp/main/schemas/hoverfly-simulation.json`.

### VS Code — `json.schemas` setting

In `.vscode/settings.json` (or user settings):

```jsonc
{
  "json.schemas": [
    {
      "fileMatch": ["*.hoverfly.json", "hoverfly-simulation.json"],
      "url": "https://json.schemastore.org/hoverfly-simulation.json",
    },
  ],
}
```

(Use a local/raw URL for `url` until SchemaStore lists it.)

### IntelliJ / WebStorm — JSON Schema mapping

Settings → Languages & Frameworks → Schemas and DTDs → **JSON Schema Mappings** → add a mapping:

- Schema file or URL: `https://json.schemastore.org/hoverfly-simulation.json`
- Schema version: **JSON Schema version 7**
- File path patterns: `*.hoverfly.json` and `hoverfly-simulation.json`

(Once the schema is on SchemaStore, IntelliJ picks up the mapping automatically from the catalog
via the `fileMatch` patterns — no manual mapping needed.)

## Submitting to SchemaStore

We have **not** submitted this yet. To do so, open a PR to
[github.com/SchemaStore/schemastore](https://github.com/SchemaStore/schemastore) following its
[CONTRIBUTING guide](https://github.com/SchemaStore/schemastore/blob/master/CONTRIBUTING.md):

1. **Schema file** — copy `schemas/hoverfly-simulation.json` to
   `src/schemas/json/hoverfly-simulation.json` in the schemastore repo. Keep the
   `"$schema": "http://json-schema.org/draft-07/schema#"` line; set `$id`/keep it pointed at
   `https://json.schemastore.org/hoverfly-simulation.json`.

2. **Catalog entry** — add to `src/api/json/catalog.json` (alphabetical by `name`):

   ```jsonc
   {
     "name": "Hoverfly simulation",
     "description": "A Hoverfly v5 simulation: request-matcher/response pairs plus global actions and metadata.",
     "fileMatch": ["*.hoverfly.json", "hoverfly-simulation.json"],
     "url": "https://json.schemastore.org/hoverfly-simulation.json",
   }
   ```

   Note: use the `*.hoverfly.json` / `hoverfly-simulation.json` patterns — **not** a bare
   `simulation.json` (too generic).

3. **Positive + negative test files** — SchemaStore requires test fixtures that prove the schema
   accepts valid documents and rejects invalid ones. Create:
   - `src/test/hoverfly-simulation/` — **positive** tests (must validate). Copy from our corpus:
     - [`testdata/valid/minimal.hoverfly.json`](../testdata/valid/minimal.hoverfly.json) — the smallest complete simulation.
     - [`testdata/valid/matchers/exact-default-and-explicit.hoverfly.json`](../testdata/valid/matchers/exact-default-and-explicit.hoverfly.json) — matcher usage.
   - `src/negative_test/hoverfly-simulation/` — **negative** tests (must NOT validate). Copy from our corpus:
     - [`testdata/invalid/hf1xx/hf101-not-a-simulation.hoverfly.json`](../testdata/invalid/hf1xx/hf101-not-a-simulation.hoverfly.json) — a non-simulation JSON object (missing required `data`/`meta`, extra top-level keys rejected by `additionalProperties:false`).
     - [`testdata/invalid/matchers/domatch-array-shape.hoverfly.json`](../testdata/invalid/matchers/domatch-array-shape.hoverfly.json) — an array-shaped `doMatch` (the schema types `field-matchers` as `object`, mirroring Hoverfly's own import rejection).

   All four are verified against `hoverfly-simulation.json`: the two positives produce zero schema
   errors; the two negatives each produce at least one. (See the validation in this track's
   notes — re-check with any JSON-Schema draft-07 validator before submitting.)

4. Run the schemastore repo's own `npm test` locally (it validates catalog + test files), then
   open the PR.

> Per architect decision D7, after SchemaStore lists the schema, document the `$schema`
> self-declaration as the primary distribution path for non-LSP users.
