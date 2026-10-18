// value: decision D3. A simulation is an object root with a `data` object and a `meta` object
// whose `schemaVersion` is a string starting with `v`; `data.pairs` is optional, as in the official
// schema.

import type { ASTNode } from 'vscode-json-languageservice';

/** The D3 fingerprint over the error-recovering AST, so a half-typed simulation still gets its diagnostics; never throws. */
export function isHoverflySimulationAst(root: ASTNode | undefined): boolean {
    if (root?.type !== 'object') {
        return false;
    }
    const dataNode = root.properties.find((p) => p.keyNode.value === 'data')?.valueNode;
    if (dataNode?.type !== 'object') {
        return false;
    }
    const metaNode = root.properties.find((p) => p.keyNode.value === 'meta')?.valueNode;
    if (metaNode?.type !== 'object') {
        return false;
    }
    const schemaVersionNode = metaNode.properties.find(
        (p) => p.keyNode.value === 'schemaVersion',
    )?.valueNode;
    return schemaVersionNode?.type === 'string' && schemaVersionNode.value.startsWith('v');
}

/** Whether a URI or path names a Hoverfly file (`*.hoverfly.json`, `*.hfy` or `hoverfly-simulation.json`), case-insensitively (D3). */
export function hasHoverflyFilename(uri: string): boolean {
    const path = uri.replace(/[?#].*/su, '');
    const segment = path.slice(path.lastIndexOf('/') + 1).toLowerCase();
    return (
        segment.endsWith('.hoverfly.json') ||
        segment.endsWith('.hfy') ||
        segment === 'hoverfly-simulation.json'
    );
}
