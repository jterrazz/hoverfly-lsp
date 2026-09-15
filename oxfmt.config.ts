import { base, defineConfig } from '@jterrazz/typescript/oxfmt';

export default defineConfig({
    ...base,
    ignorePatterns: [
        ...(base.ignorePatterns ?? []),
        // reason: the diagnostic corpus is the contract — a fixture is deliberately
        // mis-shaped and a `.expect.json` golden is byte-for-byte, so formatting
        // either would rewrite the claim the suite measures.
        'testdata/**',
        // reason: a verbatim copy of Hoverfly's official schema, kept byte-identical
        // so the schema-drift diff against upstream stays meaningful.
        'schemas/upstream-baseline.schema.json',
        // reason: the ready-to-submit SchemaStore bundle — byte-identical to what
        // SchemaStore's own checks run, negative fixtures included.
        'schemas/schemastore-submission/**',
    ],
});
