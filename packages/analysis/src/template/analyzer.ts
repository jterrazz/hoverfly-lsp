// outside: raymond reads a leading token as a helper when one is registered and as a context path
// otherwise (report 08 §4), so a bare argument-less `{{foo}}` is a path — raymond renders it empty,
// no panic — and only a call with arguments, a block open or a subexpression head is HF503; a
// dotted, `@` or `this` path is never a helper, the Request.Body method call (report 08 §6)
// included.

import { ALL_HELPERS } from '../registry/templating.data.js';
import type { HelperSpec } from '../registry/templating.data.js';
import type {
    BlockNode,
    Expression,
    MustacheNode,
    PathExpression,
    Statement,
    SubExpression,
} from './ast.js';
import type { TemplateFinding } from './finding.js';
import { checkArity, checkSpecialHelperArgs } from './helper-arguments.js';
import { parse } from './parser.js';
import type { TemplateParseError } from './parser.js';

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

const NOTHING_DECLARED: AnalyzerContext = { literalNames: new Set(), variableNames: new Set() };

function analyze(decoded: string, context?: AnalyzerContext): TemplateFinding[] {
    const findings: TemplateFinding[] = [];
    const { ast, errors } = parse(decoded);

    for (const error of errors) {
        findings.push(parseErrorFinding(error));
    }

    walkStatements(ast.body, findings, context ?? NOTHING_DECLARED);
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
        if (statement.type === 'MustacheNode') {
            checkMustache(statement, findings, context);
        } else if (statement.type === 'BlockNode') {
            checkBlock(statement, findings, context);
        }
    }
}

function checkMustache(
    node: MustacheNode,
    findings: TemplateFinding[],
    context: AnalyzerContext,
): void {
    checkCall(
        { isBlock: false, isCall: node.params.length > 0, params: node.params, path: node.path },
        findings,
        context,
    );
    for (const param of node.params) {
        checkExpression(param, findings, context);
    }
}

function checkBlock(node: BlockNode, findings: TemplateFinding[], context: AnalyzerContext): void {
    checkCall(
        { isBlock: true, isCall: true, params: node.params, path: node.path },
        findings,
        context,
    );
    for (const param of node.params) {
        checkExpression(param, findings, context);
    }
    walkStatements(node.program, findings, context);
    if (node.inverse !== undefined) {
        walkStatements(node.inverse, findings, context);
    }
}

function checkExpression(
    expression: Expression,
    findings: TemplateFinding[],
    context: AnalyzerContext,
): void {
    if (expression.type === 'SubExpression') {
        checkSubExpression(expression, findings, context);
    } else if (expression.type === 'PathExpression') {
        checkPathReferences(expression, findings, context);
    }
}

function checkSubExpression(
    node: SubExpression,
    findings: TemplateFinding[],
    context: AnalyzerContext,
): void {
    checkCall(
        { isBlock: false, isCall: true, params: node.params, path: node.path },
        findings,
        context,
    );
    for (const param of node.params) {
        checkExpression(param, findings, context);
    }
}

type Call = {
    readonly isBlock: boolean;
    readonly isCall: boolean;
    readonly params: readonly Expression[];
    readonly path: PathExpression;
};

function checkCall(
    { isBlock, isCall, params, path }: Call,
    findings: TemplateFinding[],
    context: AnalyzerContext,
): void {
    const [name, ...rest] = path.parts;
    if (name === undefined || rest.length > 0 || path.data || path.thisRef) {
        checkPathReferences(path, findings, context);
        return;
    }
    const spec = HELPER_BY_NAME.get(name);
    // value: a bare single-segment path with no argument is a context lookup, which renders empty.
    if (!isCall && !spec) {
        return;
    }

    if (!spec) {
        findings.push({ kind: 'HF503', start: path.start, end: path.end, args: { name } });
        return;
    }

    checkArity(spec, { isBlock, params, path }, findings);
    checkSpecialHelperArgs(spec, params, findings);
}

function checkPathReferences(
    path: PathExpression,
    findings: TemplateFinding[],
    context: AnalyzerContext,
): void {
    const [root, name] = path.parts;
    if (path.data || path.thisRef || name === undefined) {
        return;
    }
    if (root === 'Vars' && !context.variableNames.has(name)) {
        findings.push({ kind: 'HF505', start: path.start, end: path.end, args: { x: name } });
    } else if (root === 'Literals' && !context.literalNames.has(name)) {
        findings.push({ kind: 'HF506', start: path.start, end: path.end, args: { x: name } });
    }
}

export { analyze, type AnalyzerContext };
