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

Name your simulation files `*.hoverfly.json`, `*.hfy`, or `hoverfly-simulation.json` — those are
the conventions this schema and the LSP promote. (`.hfy` is the compact extension; the others keep
the `.json` suffix so generic JSON tooling still applies.)

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
      "fileMatch": ["*.hoverfly.json", "*.hfy", "hoverfly-simulation.json"],
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

We have **not** submitted this yet. A complete, copy-paste-ready bundle lives at
[`schemastore-submission/`](./schemastore-submission/) — the schema copy, the exact
`catalog.json` entry, 5 positive tests, and 3 negative tests, all verified against the schema with
ajv (draft-07). Follow [`schemastore-submission/SUBMISSION.md`](./schemastore-submission/SUBMISSION.md)
for the fork → copy → `node ./cli.js check` / `npm test` → open-PR steps and the cited SchemaStore
paths (`src/schemas/json/`, `src/api/json/catalog.json`, `src/test/hoverfly-simulation/`,
`src/negative_test/hoverfly-simulation/`).

> The bundle's `schema/hoverfly-simulation.json` is a copy of this directory's
> `hoverfly-simulation.json` and must be re-copied if the source schema changes.

> Per architect decision D7, after SchemaStore lists the schema, document the `$schema`
> self-declaration as the primary distribution path for non-LSP users.
