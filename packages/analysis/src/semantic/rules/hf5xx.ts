// outside: Hoverfly templates a response's body and header values when `templated` is true (report
// 01 §8, §10), never a state value; HF501 reads the body alone, as the catalog's trigger says.

import type { ASTNode, ObjectASTNode } from 'vscode-json-languageservice';
import type { Diagnostic, Range } from 'vscode-languageserver-types';

import { analyze } from '../../template/analyzer.js';
import type { AnalyzerContext } from '../../template/analyzer.js';
import { hasTemplateSyntax } from '../../template/detect.js';
import { createStringSourceMap } from '../../template/source-map.js';
import { makeDiagnostic } from '../diagnostics.js';
import type { RuleContext, SemanticRule, SimulationModel } from '../rule.js';

function analyzeStringNode(
    context: RuleContext,
    node: ASTNode,
    analyzerContext: AnalyzerContext,
    diagnostics: Diagnostic[],
): void {
    if (node.type !== 'string') {
        return;
    }
    const rawToken = context.textDocument.getText().slice(node.offset, node.offset + node.length);
    const sourceMap = createStringSourceMap(rawToken, node.offset);

    for (const finding of analyze(sourceMap.decoded, analyzerContext)) {
        const range: Range = {
            start: context.textDocument.positionAt(sourceMap.toDocOffset(finding.start)),
            end: context.textDocument.positionAt(sourceMap.toDocOffset(finding.end)),
        };
        diagnostics.push(makeDiagnostic(context.textDocument, finding.kind, range, finding.args));
    }
}

function emitHf501(context: RuleContext, node: ASTNode, diagnostics: Diagnostic[]): void {
    if (node.type !== 'string' || !hasTemplateSyntax(node.value)) {
        return;
    }
    const rawToken = context.textDocument.getText().slice(node.offset, node.offset + node.length);
    const sourceMap = createStringSourceMap(rawToken, node.offset);
    const firstMustache = sourceMap.decoded.indexOf('{{');
    const start = sourceMap.toDocOffset(firstMustache);
    const end = sourceMap.toDocOffset(firstMustache + 2);
    const range: Range = {
        start: context.textDocument.positionAt(start),
        end: context.textDocument.positionAt(end),
    };
    diagnostics.push(makeDiagnostic(context.textDocument, 'HF501', range));
}

function propValue(object: ObjectASTNode | undefined, key: string): ASTNode | undefined {
    return object?.properties.find((p) => p.keyNode.value === key)?.valueNode;
}

function collectNames(
    dataNode: ObjectASTNode | undefined,
    key: string,
    field: string,
): Set<string> {
    const names = new Set<string>();
    const array = propValue(dataNode, key);
    if (array?.type !== 'array') {
        return names;
    }
    for (const item of array.items) {
        if (item.type !== 'object') {
            continue;
        }
        const value = propValue(item, field);
        if (value?.type === 'string') {
            names.add(value.value);
        }
    }
    return names;
}

function isTemplated(node: ASTNode | undefined): boolean {
    return node?.type === 'boolean' && node.value;
}

function analyzeHeaderValue(
    context: RuleContext,
    node: ASTNode | undefined,
    analyzerContext: AnalyzerContext,
    diagnostics: Diagnostic[],
): void {
    if (!node) {
        return;
    }
    if (node.type === 'string') {
        analyzeStringNode(context, node, analyzerContext, diagnostics);
        return;
    }
    if (node.type === 'array') {
        for (const item of node.items) {
            analyzeStringNode(context, item, analyzerContext, diagnostics);
        }
    }
}

const hf5xxTemplateRule: SemanticRule = {
    run(context: RuleContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const model: SimulationModel = context.model;

        const analyzerContext: AnalyzerContext = {
            variableNames: collectNames(model.dataNode, 'variables', 'name'),
            literalNames: collectNames(model.dataNode, 'literals', 'name'),
        };

        for (const pair of model.pairs) {
            const { response } = pair;
            const templated = isTemplated(response.templated.valueNode);
            const bodyNode = response.body.valueNode;

            if (bodyNode) {
                if (templated) {
                    analyzeStringNode(context, bodyNode, analyzerContext, diagnostics);
                } else {
                    emitHf501(context, bodyNode, diagnostics);
                }
            }

            if (templated) {
                for (const header of response.headers) {
                    analyzeHeaderValue(context, header.valueNode, analyzerContext, diagnostics);
                }
            }
        }

        return diagnostics;
    },
};

/** All HF5xx templating rules. The integrator spreads this into `ALL_RULES`. */
const HF5XX_RULES: readonly SemanticRule[] = [hf5xxTemplateRule];

export { HF5XX_RULES, hf5xxTemplateRule };
