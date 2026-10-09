import type { Hover, JSONDocument, Position, Range } from 'vscode-json-languageservice';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import { MarkupKind } from 'vscode-languageserver-types';

import { FAKER_NAMES, FAKER_PARAMETERIZED_PANICS, GOFAKEIT_VERSION } from '../registry/faker.js';
import { ALL_HELPERS } from '../registry/templating.js';
import type { HelperSpec } from '../registry/templating.js';
import type {
    Expression,
    MustacheNode,
    PathExpression,
    Statement,
    SubExpression,
} from '../template/ast.js';
import { parse } from '../template/parser.js';
import { findTemplateLocation } from './template-location.js';
import type { TemplateLocation } from './template-location.js';
import { REQUEST_MEMBERS } from './template-members.js';

const HELPER_BY_NAME: ReadonlyMap<string, HelperSpec> = new Map(
    ALL_HELPERS.map((spec) => [spec.name, spec]),
);
const FAKER_NAME_SET: ReadonlySet<string> = new Set(FAKER_NAMES);
const FAKER_PANIC_SET: ReadonlySet<string> = new Set(FAKER_PARAMETERIZED_PANICS);
const REQUEST_MEMBER_BY_NAME = new Map(REQUEST_MEMBERS.map((m) => [m.name, m]));

function getTemplateHover(
    document: TextDocument,
    jsonDocument: JSONDocument,
    position: Position,
): Hover | undefined {
    const offset = document.offsetAt(position);
    const location = findTemplateLocation(document, jsonDocument, offset);
    if (!location) {
        return undefined;
    }

    const { ast } = parse(location.decoded);
    const hit = findHover(ast.body, location.decodedCursor);
    if (!hit) {
        return undefined;
    }
    const range = toRange(document, location, hit.start, hit.end);
    return { contents: { kind: MarkupKind.Markdown, value: hit.markdown }, range };
}

type HoverHit = {
    readonly markdown: string;
    readonly start: number;
    readonly end: number;
};

function findHover(statements: readonly Statement[], cursor: number): HoverHit | undefined {
    for (const statement of statements) {
        if (!spans(statement, cursor)) {
            continue;
        }
        switch (statement.type) {
            case 'MustacheNode': {
                return mustacheHover(statement, cursor);
            }
            case 'BlockNode': {
                const onName = pathHover(statement.path, cursor, true);
                if (onName) {
                    return onName;
                }
                const inParam = paramHover(statement.params, cursor, headName(statement.path));
                if (inParam) {
                    return inParam;
                }
                return (
                    findHover(statement.program, cursor) ??
                    (statement.inverse ? findHover(statement.inverse, cursor) : undefined)
                );
            }
            default: {
                return undefined;
            }
        }
    }
    return undefined;
}

function mustacheHover(node: MustacheNode, cursor: number): HoverHit | undefined {
    if (spans(node.path, cursor)) {
        return pathHover(node.path, cursor, node.params.length > 0);
    }
    return paramHover(node.params, cursor, headName(node.path));
}

function paramHover(
    params: readonly Expression[],
    cursor: number,
    head: string | undefined,
): HoverHit | undefined {
    for (const [index, param] of params.entries()) {
        if (!spans(param, cursor)) {
            continue;
        }
        if (param.type === 'SubExpression') {
            return subExpressionHover(param, cursor);
        }
        if (param.type === 'PathExpression') {
            return pathHover(param, cursor, false);
        }
        if (param.type === 'StringLiteral' && head === 'faker' && index === 0) {
            return { markdown: fakerMarkdown(param.value), start: param.start, end: param.end };
        }
    }
    return undefined;
}

function subExpressionHover(node: SubExpression, cursor: number): HoverHit | undefined {
    if (spans(node.path, cursor)) {
        return pathHover(node.path, cursor, true);
    }
    return paramHover(node.params, cursor, headName(node.path));
}

function headName(path: PathExpression): string | undefined {
    if (path.data || path.thisRef || path.parts.length !== 1) {
        return undefined;
    }
    return path.parts[0];
}

function pathHover(path: PathExpression, cursor: number, asCall: boolean): HoverHit | undefined {
    void cursor;
    if (!path.data && !path.thisRef && path.parts[0] === 'Request' && path.parts.length >= 2) {
        const member = REQUEST_MEMBER_BY_NAME.get(path.parts[1] ?? '');
        if (member) {
            return {
                markdown: requestMemberMarkdown(member.name),
                start: path.start,
                end: path.end,
            };
        }
    }

    if (!path.data && !path.thisRef && path.parts.length === 1) {
        const name = path.parts[0] ?? '';
        const spec = HELPER_BY_NAME.get(name);
        if (spec && (asCall || spec.args.length === 0)) {
            return { markdown: helperMarkdown(spec), start: path.start, end: path.end };
        }
    }
    return undefined;
}

function helperMarkdown(spec: HelperSpec): string {
    const args = spec.args.map((a) =>
        a.optional ? `[${a.name}: ${a.type}]` : `${a.name}: ${a.type}`,
    );
    if (spec.variadic) {
        args.push('…');
    }
    const prefix = spec.block ? '#' : '';
    const signature = [`${prefix}${spec.name}`, ...args].join(' ');
    const kind = spec.block ? 'block helper' : 'inline helper';
    const origin = spec.builtin ? 'raymond built-in' : 'Hoverfly helper';
    const required = spec.args.filter((a) => !a.optional).length;
    const arity = spec.variadic
        ? `≥ ${required} argument(s)`
        : `${required}${required === spec.args.length ? '' : `–${spec.args.length}`} argument(s)`;
    return [
        `### \`${spec.name}\` — ${kind}`,
        '',
        `\`${signature}\``,
        '',
        spec.docs,
        '',
        `**Kind:** ${kind} · **Arity:** ${arity} · **Source:** ${origin}`,
        '',
        `Example: \`${spec.example}\``,
    ].join('\n');
}

function requestMemberMarkdown(name: string): string {
    const member = REQUEST_MEMBER_BY_NAME.get(name);
    if (!member) {
        return '';
    }
    const kind = member.methodCall ? 'method call' : 'field';
    return [
        `### \`Request.${member.name}\` — ${kind}`,
        '',
        member.docs,
        '',
        `Example: \`${member.example}\``,
    ].join('\n');
}

function fakerMarkdown(type: string): string {
    const known = FAKER_NAME_SET.has(type);
    const panics = FAKER_PANIC_SET.has(type);
    const lines = [`### faker \`'${type}'\``, ''];
    if (known) {
        lines.push(`A zero-arg gofakeit (v${GOFAKEIT_VERSION}) method.`);
    } else if (panics) {
        lines.push(
            `⚠️ \`${type}\` is a PARAMETERIZED gofakeit method — calling it with no arguments panics at render time.`,
        );
    } else {
        lines.push(
            `Unknown gofakeit type for the pinned version (v${GOFAKEIT_VERSION}); it renders empty.`,
        );
    }
    return lines.join('\n');
}

function spans(node: { start: number; end: number }, cursor: number): boolean {
    return cursor >= node.start && cursor <= node.end;
}

function toRange(
    document: TextDocument,
    location: TemplateLocation,
    start: number,
    end: number,
): Range {
    const docStart = location.sourceMap.toDocOffset(start);
    const docEnd = location.sourceMap.toDocOffset(end);
    return { start: document.positionAt(docStart), end: document.positionAt(docEnd) };
}

export { getTemplateHover };
