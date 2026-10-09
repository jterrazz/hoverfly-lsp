import type { ASTNode, ObjectASTNode } from 'vscode-json-languageservice';

import type { FieldContainer, MatcherModel } from '../rule.js';

/** A matcher of a field, at its doMatch depth, with the key node of its own doMatch. */
export type WalkedMatcher = {
    readonly matcher: MatcherModel;
    readonly depth: number;
    readonly doMatchKeyNode: ASTNode | undefined;
};

function keyNodeOf(object: ObjectASTNode | undefined, key: string): ASTNode | undefined {
    return object?.properties.find((p) => p.keyNode.value === key)?.keyNode;
}

function nestedMatcher(node: ASTNode, fieldName: string, container: FieldContainer): MatcherModel {
    const object = node.type === 'object' ? node : undefined;
    const value = (k: string): ASTNode | undefined =>
        object?.properties.find((p) => p.keyNode.value === k)?.valueNode;
    const matcherNode = value('matcher');
    return {
        node: object,
        matcherNode,
        matcherName: matcherNode?.type === 'string' ? matcherNode.value : undefined,
        valueNode: value('value'),
        configNode: value('config'),
        doMatchNode: value('doMatch'),
        parent: { fieldName, container },
    };
}

/** Every matcher of a field, each doMatch link included, in document order. */
export function walkMatchers(matchers: readonly MatcherModel[]): WalkedMatcher[] {
    const out: WalkedMatcher[] = [];

    const visit = (matcher: MatcherModel, depth: number): void => {
        out.push({
            matcher,
            depth,
            doMatchKeyNode: keyNodeOf(matcher.node, 'doMatch'),
        });
        const { doMatchNode } = matcher;
        if (doMatchNode?.type === 'object') {
            // outside: Hoverfly accepts `doMatch` as one chained matcher object.
            visit(
                nestedMatcher(doMatchNode, matcher.parent.fieldName, matcher.parent.container),
                depth + 1,
            );
        } else if (doMatchNode?.type === 'array') {
            // invariant: a legacy array-shaped doMatch is a schema error (HF102), still walked so
            // its nested matchers are judged rather than hidden behind the shape error.
            for (const item of doMatchNode.items) {
                visit(
                    nestedMatcher(item, matcher.parent.fieldName, matcher.parent.container),
                    depth + 1,
                );
            }
        }
    };

    for (const matcher of matchers) {
        visit(matcher, 0);
    }
    return out;
}
