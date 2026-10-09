// outside: raymond reads a leading token as a helper when one is registered and as a context path
// otherwise (report 08 §4), so a bare argument-less `{{foo}}` is a path — raymond renders it empty,
// no panic — and only a call with arguments, a block open or a subexpression head is HF503; a
// dotted, `@` or `this` path is never a helper, but for the Request.Body method call (report 08
// §6).

import { FAKER_NAMES, FAKER_PARAMETERIZED_PANICS, GOFAKEIT_VERSION } from '../registry/faker.js';
import { ALL_HELPERS, NOW_OFFSET_UNITS } from '../registry/templating.js';
import type { HelperSpec } from '../registry/templating.js';
import type {
    BlockNode,
    Expression,
    MustacheNode,
    PathExpression,
    Statement,
    StringLiteral,
    SubExpression,
} from './ast.js';
import { parse } from './parser.js';
import type { TemplateParseError } from './parser.js';

type TemplateFindingKind =
    | 'HF502'
    | 'HF503'
    | 'HF504'
    | 'HF505'
    | 'HF506'
    | 'HF507'
    | 'HF508'
    | 'HF509';

type TemplateFinding = {
    readonly kind: TemplateFindingKind;
    /** Inclusive start offset into the decoded template. */
    readonly start: number;
    /** Exclusive end offset into the decoded template. */
    readonly end: number;
    /** Catalog message placeholder args for this finding's code. */
    readonly args: Readonly<Record<string, string>>;
};

/** Document-level context the analyzer needs to resolve `Vars.X` / `Literals.X` references. */
type AnalyzerContext = {
    /** `data.variables[].name` values in scope (for HF505). */
    readonly variableNames: ReadonlySet<string>;
    /** `data.literals[].name` values in scope (for HF506). */
    readonly literalNames: ReadonlySet<string>;
};

const HELPER_BY_NAME: ReadonlyMap<string, HelperSpec> = new Map(
    ALL_HELPERS.map((spec) => [spec.name, spec]),
);

const FAKER_NAME_SET: ReadonlySet<string> = new Set(FAKER_NAMES);
const FAKER_PANIC_SET: ReadonlySet<string> = new Set(FAKER_PARAMETERIZED_PANICS);

const NOW_OFFSET_RE = new RegExp(
    `^[-+]?(?:\\d+(?:\\.\\d+)?(?:${NOW_OFFSET_UNITS.map(escapeRegExp).join('|')}))+$`,
    'u',
);

function escapeRegExp(text: string): string {
    return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

function analyze(
    decoded: string,
    context: AnalyzerContext = { variableNames: new Set(), literalNames: new Set() },
): TemplateFinding[] {
    const findings: TemplateFinding[] = [];
    const { ast, errors } = parse(decoded);

    for (const error of errors) {
        findings.push(parseErrorFinding(error));
    }

    walkStatements(ast.body, findings, context);
    return findings;
}

function parseErrorFinding(error: TemplateParseError): TemplateFinding {
    return {
        kind: 'HF502',
        start: error.start,
        end: error.end,
        args: { message: error.message },
    };
}

function walkStatements(
    statements: readonly Statement[],
    findings: TemplateFinding[],
    context: AnalyzerContext,
): void {
    for (const statement of statements) {
        switch (statement.type) {
            case 'ContentNode': {
                break;
            }
            case 'MustacheNode': {
                checkMustache(statement, findings, context);
                break;
            }
            case 'BlockNode': {
                checkBlock(statement, findings, context);
                break;
            }
        }
    }
}

function checkMustache(
    node: MustacheNode,
    findings: TemplateFinding[],
    context: AnalyzerContext,
): void {
    checkCall(node.path, node.params, node.params.length > 0, false, findings, context);
    for (const param of node.params) {
        checkExpression(param, findings, context);
    }
}

function checkBlock(node: BlockNode, findings: TemplateFinding[], context: AnalyzerContext): void {
    checkCall(node.path, node.params, true, true, findings, context);
    for (const param of node.params) {
        checkExpression(param, findings, context);
    }
    walkStatements(node.program, findings, context);
    if (node.inverse) {
        walkStatements(node.inverse, findings, context);
    }
}

function checkExpression(
    expression: Expression,
    findings: TemplateFinding[],
    context: AnalyzerContext,
): void {
    switch (expression.type) {
        case 'SubExpression': {
            checkSubExpression(expression, findings, context);
            break;
        }
        case 'PathExpression': {
            checkPathReferences(expression, findings, context);
            break;
        }
        default: {
            break;
        }
    }
}

function checkSubExpression(
    node: SubExpression,
    findings: TemplateFinding[],
    context: AnalyzerContext,
): void {
    checkCall(node.path, node.params, true, false, findings, context);
    for (const param of node.params) {
        checkExpression(param, findings, context);
    }
}

function checkCall(
    path: PathExpression,
    params: readonly Expression[],
    isCall: boolean,
    isBlock: boolean,
    findings: TemplateFinding[],
    context: AnalyzerContext,
): void {
    if (isRequestBodyMethodCall(path)) {
        return;
    }

    if (path.parts.length !== 1 || path.data || path.thisRef) {
        checkPathReferences(path, findings, context);
        return;
    }

    const name = path.parts[0];
    if (name === undefined) {
        return;
    }
    const spec = HELPER_BY_NAME.get(name);

    if (!isCall && !spec) {
        checkPathReferences(path, findings, context);
        return;
    }

    if (!spec) {
        findings.push({ kind: 'HF503', start: path.start, end: path.end, args: { name } });
        return;
    }

    checkArity(spec, path, params, isBlock, findings);
    checkSpecialHelperArgs(spec, params, findings);
}

// outside: raymond does not enforce arity, so HF504 checks the intended contract; the catalog still
// rates it an Error (D4).
function checkArity(
    spec: HelperSpec,
    path: PathExpression,
    params: readonly Expression[],
    isBlock: boolean,
    findings: TemplateFinding[],
): void {
    if (spec.block !== isBlock) {
        const wanted = spec.block ? 'a block helper' : 'an inline helper';
        findings.push({
            kind: 'HF504',
            start: path.start,
            end: path.end,
            args: { name: spec.name, sig: wanted, n: String(params.length) },
        });
        return;
    }

    const required = spec.args.filter((arg) => !arg.optional).length;
    const max = spec.variadic ? Number.POSITIVE_INFINITY : spec.args.length;
    const got = params.length;
    if (got < required || got > max) {
        findings.push({
            kind: 'HF504',
            start: path.start,
            end: path.end,
            args: { name: spec.name, sig: describeArity(spec, required, max), n: String(got) },
        });
    }
}

function describeArity(spec: HelperSpec, required: number, max: number): string {
    if (spec.variadic) {
        return required === 0 ? 'any number of arguments' : `at least ${plural(required)}`;
    }
    if (required === max) {
        return plural(required);
    }
    return `${required} to ${max} arguments`;
}

function plural(count: number): string {
    return count === 1 ? '1 argument' : `${count} arguments`;
}

// invariant: only a string-literal argument is judged — a path or a subexpression is unknowable
// statically.
function checkSpecialHelperArgs(
    spec: HelperSpec,
    params: readonly Expression[],
    findings: TemplateFinding[],
): void {
    if (spec.name === 'faker') {
        checkFakerArg(params[0], findings);
    } else if (spec.name === 'now') {
        checkNowOffsetArg(params[0], findings);
    }
}

function checkFakerArg(arg: Expression | undefined, findings: TemplateFinding[]): void {
    const literal = asStringLiteral(arg);
    if (!literal) {
        return;
    }
    const type = literal.value;
    if (FAKER_NAME_SET.has(type)) {
        return;
    }
    if (FAKER_PANIC_SET.has(type)) {
        findings.push({ kind: 'HF508', start: literal.start, end: literal.end, args: { t: type } });
        return;
    }
    findings.push({
        kind: 'HF507',
        start: literal.start,
        end: literal.end,
        args: { t: type, version: GOFAKEIT_VERSION },
    });
}

function checkNowOffsetArg(arg: Expression | undefined, findings: TemplateFinding[]): void {
    const literal = asStringLiteral(arg);
    if (!literal) {
        return;
    }
    const offset = literal.value;
    // outside: an empty offset and `0` are valid; Hoverfly silently ignores any other offset
    // outside the unit grammar.
    if (offset === '' || offset === '0' || NOW_OFFSET_RE.test(offset)) {
        return;
    }
    findings.push({ kind: 'HF509', start: literal.start, end: literal.end, args: { o: offset } });
}

function asStringLiteral(expression: Expression | undefined): StringLiteral | undefined {
    return expression?.type === 'StringLiteral' ? expression : undefined;
}

function checkPathReferences(
    path: PathExpression,
    findings: TemplateFinding[],
    context: AnalyzerContext,
): void {
    if (path.data || path.thisRef || path.parts.length < 2) {
        return;
    }
    const root = path.parts[0];
    const name = path.parts[1];
    if (name === undefined) {
        return;
    }
    if (root === 'Vars' && !context.variableNames.has(name)) {
        findings.push({ kind: 'HF505', start: path.start, end: path.end, args: { x: name } });
    } else if (root === 'Literals' && !context.literalNames.has(name)) {
        findings.push({ kind: 'HF506', start: path.start, end: path.end, args: { x: name } });
    }
}

function isRequestBodyMethodCall(path: PathExpression): boolean {
    return (
        !path.data &&
        !path.thisRef &&
        path.parts.length === 2 &&
        path.parts[0] === 'Request' &&
        path.parts[1] === 'Body'
    );
}

export { analyze, type AnalyzerContext, type TemplateFinding };
