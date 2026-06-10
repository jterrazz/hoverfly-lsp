/*
 * Regenerates packages/core/src/schema/hoverfly.schema.generated.ts from the editable
 * hoverfly.schema.json. Inlining as a .ts module gives the language service zero-runtime-fs
 * access to the schema (tsc + NodeNext does not copy .json into dist/).
 * Run from the repo root or this package: node packages/core/scripts/generate-schema.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const schemaDir = join(here, "..", "src", "schema");
const jsonPath = join(schemaDir, "hoverfly.schema.json");
const outPath = join(schemaDir, "hoverfly.schema.generated.ts");

const parsed = JSON.parse(readFileSync(jsonPath, "utf8"));

/*
 * Embed as a JSON string parsed at module load. This keeps the schema in one compact line
 * the formatter (oxfmt) leaves untouched, so regeneration is idempotent. Escaping backslashes,
 * backticks and ${ makes it safe inside a template literal.
 */
const literal = JSON.stringify(parsed)
  .replaceAll("\\", String.raw`\\`)
  .replaceAll("`", String.raw`\``)
  .replaceAll("${", String.raw`\${`);

const contents = `/**
 * GENERATED — do not edit by hand.
 *
 * Embeds hoverfly.schema.json as a TypeScript module so the language service can resolve it
 * with zero runtime fs/network access (tsc + NodeNext does not copy .json into dist/, so we
 * inline it here). Regenerate with: node packages/core/scripts/generate-schema.mjs
 *
 * @see ./hoverfly.schema.json — the editable source of truth.
 * @see ./provenance.ts — the upstream Hoverfly commit this mirrors.
 */
import { type JSONSchema } from "vscode-json-languageservice";

export const hoverflySchema = JSON.parse(
  \`${literal}\`,
) as JSONSchema;
`;

writeFileSync(outPath, contents);
console.log(`Wrote ${outPath}`);
