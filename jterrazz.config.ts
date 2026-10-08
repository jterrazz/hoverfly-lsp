import { test } from '@jterrazz/test/config';
import { defineConfig } from '@jterrazz/typescript/config';

export default defineConfig({
    kind: 'workspace',
    presets: [test()],
    typescript: {
        oxfmt: {
            ignore: {
                'schemas/schemastore-submission/**':
                    "the ready-to-submit SchemaStore bundle, byte-identical to what SchemaStore's own checks run",
                'schemas/upstream/**':
                    "a verbatim copy of Hoverfly's official schema, kept byte-identical so the drift diff against upstream stays meaningful",
                'testdata/**':
                    'the diagnostic corpus: a fixture is mis-shaped on purpose and a golden is compared byte for byte',
            },
        },
        roots: {
            assets: 'the logo the README and the editor listings show',
            editors:
                'the thin launcher of each editor: VS Code (a workspace member), Claude Code, IntelliJ and Zed',
            research: 'the research reports the binding decisions D1–D9 were taken from',
            schemas:
                'the JSON Schema published to SchemaStore, with the upstream baseline the drift watcher compares',
            scripts: 'the generator that projects docs/reference/ from the built analysis package',
            testdata: 'the reference corpus: the behavioural contract the analysis specs read',
        },
    },
});
