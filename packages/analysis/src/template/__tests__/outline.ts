import type { Expression, Statement } from '../ast.js';
import type { parse } from '../parser.js';

function span(node: { end: number; start: number }): string {
    return `${node.start}-${node.end}`;
}

/** One expression as `text@start-end`, its kind written the way the template spells it. */
export function expression(node: Expression): string {
    switch (node.type) {
        case 'PathExpression': {
            return `${node.data ? '@' : ''}${node.thisRef ? 'this:' : ''}${node.parts.join('.')}<${node.original}>@${span(node)}`;
        }
        case 'SubExpression': {
            return `(${[expression(node.path), ...node.params.map(expression)].join(' ')})@${span(node)}`;
        }
        case 'StringLiteral': {
            return `${node.quote}${node.value}${node.quote}@${span(node)}`;
        }
        case 'NumberLiteral': {
            return `${node.raw}=${String(node.value)}@${span(node)}`;
        }
        case 'BooleanLiteral': {
            return `${String(node.value)}@${span(node)}`;
        }
    }
}

function statement(node: Statement): string {
    switch (node.type) {
        case 'ContentNode': {
            return `${JSON.stringify(node.value)}@${span(node)}`;
        }
        case 'MustacheNode': {
            const inner = [expression(node.path), ...node.params.map(expression)].join(' ');
            return node.escaped ? `{{${inner}}}@${span(node)}` : `{{{${inner}}}}@${span(node)}`;
        }
        case 'BlockNode': {
            const head = [expression(node.path), ...node.params.map(expression)].join(' ');
            const inverse =
                node.inverse === undefined
                    ? ''
                    : ` else [${node.inverse.map(statement).join(' ')}]`;
            const close = node.closeTag === undefined ? 'unclosed' : span(node.closeTag);
            return `#${head} [${node.program.map(statement).join(' ')}]${inverse} open ${span(node.openTag)} close ${close}@${span(node)}`;
        }
    }
}

export function outline(result: ReturnType<typeof parse>): string[] {
    return [
        `program@${span(result.ast)}`,
        ...result.ast.body.map(statement),
        ...result.errors.map((error) => `error ${error.message}@${span(error)}`),
    ];
}
