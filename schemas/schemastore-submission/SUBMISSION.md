# SchemaStore submission bundle: Hoverfly Simulation

A copy-paste-ready bundle for submitting `hoverfly-simulation.json` to
[SchemaStore/schemastore](https://github.com/SchemaStore/schemastore). Everything here is
self-contained: a copy of the schema, the catalog entry, positive tests, and negative tests.
Fork SchemaStore, copy these files into the documented paths, run their checks, open the PR.

## What's in this bundle

| Path                                      | Goes to (in the schemastore repo)                                   |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `schema/hoverfly-simulation.json`         | `src/schemas/json/hoverfly-simulation.json`                         |
| `catalog-entry.json`                      | one object inside the `schemas` array of `src/api/json/catalog.json`|
| `test/*.json` (5 files)                    | `src/test/hoverfly-simulation/`                                     |
| `negative_test/*.json` (3 files)           | `src/negative_test/hoverfly-simulation/`                            |

> **The schema is generated from the repo.** `schema/hoverfly-simulation.json` is a verbatim copy
> of `schemas/hoverfly-simulation.json`. If the source schema changes, re-copy it before
> submitting (`cp schemas/hoverfly-simulation.json schemas/schemastore-submission/schema/`).

## Confirmed SchemaStore layout (verified 2026-06)

Sources:
- CONTRIBUTING: <https://github.com/SchemaStore/schemastore/blob/master/CONTRIBUTING.md>
  (raw: <https://raw.githubusercontent.com/SchemaStore/schemastore/master/CONTRIBUTING.md>)
- Catalog: <https://raw.githubusercontent.com/SchemaStore/schemastore/master/src/api/json/catalog.json>

- **Schema file** → `src/schemas/json/<schemaName>.json` (here `hoverfly-simulation.json`).
- **Catalog** → `src/api/json/catalog.json`, an object pushed into the `schemas` array. Field
  order: `name`, `description`, `fileMatch` (optional), `url`, `versions` (optional). The catalog
  is **not** strictly alphabetised in practice, but adding near other entries alphabetically by
  `name` is the convention and keeps diffs clean. We have no multiple versions, so no `versions`.
- **Positive tests** → `src/test/<schemaName>/`: the directory name **must match the schema
  filename** (`hoverfly-simulation`). Files are matched to the schema by living in this directory,
  not by filename pattern, so any descriptive `.json` name works. (`.json`, `.toml`, `.yml`,
  `.yaml` are all supported; ours are JSON.)
- **Negative tests** → `src/negative_test/<schemaName>/`: **supported and recommended** (not
  strictly required). Files here must FAIL validation.
- **`fileMatch` policy**: avoid generic patterns that cause false positives across tools (e.g. a
  bare `config.json` / `simulation.json`). Ours are all specific: `*.hoverfly.json` and `*.hfy`
  are project-specific extensions; `hoverfly-simulation.json` is a specific filename. No bare
  `*.json`.
- **Validation**: `node ./cli.js check` validates all schemas + their test files; scope to one
  with `node ./cli.js check --schema-name=hoverfly-simulation.json`. `npm run prettier:fix`
  formats. `node cli.js new-schema` scaffolds (optional helper; manual copy below also works).

## Step-by-step

1. **Fork & clone**

   ```bash
   gh repo fork SchemaStore/schemastore --clone
   cd schemastore
   npm install
   git checkout -b add-hoverfly-simulation
   ```

2. **Copy the schema**

   ```bash
   cp <this-bundle>/schema/hoverfly-simulation.json src/schemas/json/hoverfly-simulation.json
   ```

   Keep the `"$schema": "http://json-schema.org/draft-07/schema#"` and
   `"$id": "https://json.schemastore.org/hoverfly-simulation.json"` lines as-is.

3. **Add the catalog entry**: open `src/api/json/catalog.json`, find the `"schemas": [ ... ]`
   array, and insert the object from `catalog-entry.json` (alphabetical-ish by `name`, i.e. near
   other "H" entries). Exact object to add:

   ```json
   {
     "name": "Hoverfly Simulation",
     "description": "A Hoverfly v5 simulation: request-matcher/response pairs plus global actions and metadata.",
     "fileMatch": ["*.hoverfly.json", "*.hfy", "hoverfly-simulation.json"],
     "url": "https://json.schemastore.org/hoverfly-simulation.json"
   }
   ```

4. **Copy the tests** (the dir name must be `hoverfly-simulation`, matching the schema filename)

   ```bash
   mkdir -p src/test/hoverfly-simulation src/negative_test/hoverfly-simulation
   cp <this-bundle>/test/*.json          src/test/hoverfly-simulation/
   cp <this-bundle>/negative_test/*.json src/negative_test/hoverfly-simulation/
   ```

5. **Run their checks**

   ```bash
   npm run prettier:fix
   node ./cli.js check --schema-name=hoverfly-simulation.json   # scoped
   npm test                                                     # full suite
   ```

   Expect: 5 positive test files validate, 3 negative test files are rejected.

6. **Commit & open the PR**

   ```bash
   git add src/schemas/json/hoverfly-simulation.json \
           src/api/json/catalog.json \
           src/test/hoverfly-simulation/ \
           src/negative_test/hoverfly-simulation/
   git commit -m "Add Hoverfly Simulation schema"
   git push -u origin add-hoverfly-simulation
   gh pr create --repo SchemaStore/schemastore --fill
   ```

## Test files

### Positive (`test/` → `src/test/hoverfly-simulation/`): must validate

| File                              | Covers                                                              |
| --------------------------------- | ------------------------------------------------------------------- |
| `minimal.json`                    | Smallest complete simulation (one pair, exact matchers, `meta`).    |
| `rich-stateful-templated.json`    | State transitions + response templating + varied matchers.          |
| `all-request-fields-combined.json`| Every request field with matchers (method/scheme/path/query/body…). |
| `stateful-login-machine.json`     | Multi-pair state machine (login → fetch → update → logout).         |
| `realworld-oauth2.json`           | Real-world OAuth2 token + userinfo flow.                            |

### Negative (`negative_test/` → `src/negative_test/hoverfly-simulation/`): must be rejected

| File                            | Why the schema rejects it                                              |
| ------------------------------- | ---------------------------------------------------------------------- |
| `domatch-as-array.json`         | `doMatch` is typed `object`; an array fails (`doMatch should be object`).|
| `not-a-simulation.json`         | Arbitrary object: missing required `data`/`meta`, extra top-level keys rejected by `additionalProperties:false`. |
| `response-header-not-array.json`| A response header value is a string; headers must be `array` of strings.|

> These were chosen because the **bundled schema itself** rejects them (verified with ajv
> draft-07). Many of the LSP's other "invalid" fixtures only trip LSP-only semantic rules and
> still pass the schema; those are deliberately excluded here, since SchemaStore only checks the
> schema.

## Validation done in this repo

Validated with `ajv` (draft-07) against `schema/hoverfly-simulation.json`:

- All 5 positives: **PASS** (zero schema errors).
- All 3 negatives: **REJECTED** (at least one schema error each).
