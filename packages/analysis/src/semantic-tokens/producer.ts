// invariant: template tokens map each decoded offset back to the document through the escape-aware
// source map the HF5xx diagnostics use, so an escape before `{{` still lands each token on its
// characters; the server delta-encodes the sorted, single-line list.

import type { ASTNode, JSONDocument } from 'vscode-json-languageservice';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import { hasHoverflyFilename, isHoverflySimulationAst } from '../fingerprint.js';
import { MATCHER_SPECS } from '../registry/matchers.js';
import { buildSimulationModel } from '../semantic/model.js';
import type { MatcherModel, SimulationModel } from '../semantic/rule.js';
import { createStringSourceMap } from '../template/source-map.js';
import { templateTokens } from './template-tokens.js';
import { TokenEmitter } from './token-emitter.js';
import type { SemanticToken } from './token-emitter.js';

const MATCHER_NAME_SET: ReadonlySet<string> = new Set(MATCHER_SPECS.map((spec) => spec.name));

function emitTemplateString(emitter: TokenEmitter, document: TextDocument, node: ASTNode): void {
    if (node.type !== 'string') {
        return;
    }
    const rawToken = document.getText().slice(node.offset, node.offset + node.length);
    const sourceMap = createStringSourceMap(rawToken, node.offset);
    for (const { end, start, type } of templateTokens(sourceMap.decoded)) {
        emitter.emitDecoded(sourceMap, start, end, type);
    }
}

function isTemplated(node: ASTNode | undefined): boolean {
    return node?.type === 'boolean' && node.value;
}

function emitTemplatableValue(
    emitter: TokenEmitter,
    document: TextDocument,
    node: ASTNode | undefined,
): void {
    if (node === undefined) {
        return;
    }
    for (const item of node.type === 'array' ? node.items : [node]) {
        emitTemplateString(emitter, document, item);
    }
}

function emitMatcherName(emitter: TokenEmitter, matcher: MatcherModel): void {
    const node = matcher.matcherNode;
    if (node?.type !== 'string' || !MATCHER_NAME_SET.has(node.value)) {
        return;
    }
    emitter.emitDocSpan(node.offset + 1, node.offset + node.length - 1, 'enumMember');
}

function emitModel(emitter: TokenEmitter, document: TextDocument, model: SimulationModel): void {
    for (const pair of model.pairs) {
        for (const fieldEntry of pair.request.fields) {
            for (const matcher of fieldEntry.matchers) {
                emitMatcherName(emitter, matcher);
            }
        }

        const { response } = pair;
        const templated = isTemplated(response.templated.valueNode);
        const bodyNode = response.body.valueNode;

        emitTemplatableValue(emitter, document, bodyNode);

        if (templated) {
            for (const header of response.headers) {
                emitTemplatableValue(emitter, document, header.valueNode);
            }
        }
    }
}

/** The absolute, sorted tokens of a document — none unless it is a simulation or named for Hoverfly; never throws. */
function getSemanticTokens(
    document: TextDocument,
    jsonDocument: JSONDocument,
    model?: SimulationModel,
): SemanticToken[] {
    if (!isHoverflySimulationAst(jsonDocument.root) && !hasHoverflyFilename(document.uri)) {
        return [];
    }

    const emitter = new TokenEmitter(document);
    const resolved = model ?? buildSimulationModel(jsonDocument);
    emitModel(emitter, document, resolved);
    return emitter.result();
}

export { getSemanticTokens };
export type { SemanticToken } from './token-emitter.js';
