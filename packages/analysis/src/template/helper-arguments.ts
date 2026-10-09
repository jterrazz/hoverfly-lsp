import { FAKER_NAMES, FAKER_PARAMETERIZED_PANICS, GOFAKEIT_VERSION } from '../registry/faker.js';
import { NOW_OFFSET_UNITS } from '../registry/templating.data.js';
import type { HelperSpec } from '../registry/templating.data.js';
import type { Expression, PathExpression, StringLiteral } from './ast.js';
import type { TemplateFinding } from './finding.js';

const FAKER_NAME_SET: ReadonlySet<string> = new Set(FAKER_NAMES);
const FAKER_PANIC_SET: ReadonlySet<string> = new Set(FAKER_PARAMETERIZED_PANICS);

const NOW_OFFSET_RE = new RegExp(
    `^[-+]?(?:\\d+(?:\\.\\d+)?(?:${NOW_OFFSET_UNITS.map(escapeRegExp).join('|')}))+$`,
    'u',
);

function escapeRegExp(text: string): string {
    return text.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

// outside: raymond does not enforce arity, so HF504 checks the intended contract; the catalog still
// rates it an Error (D4).
export function checkArity(
    spec: HelperSpec,
    {
        isBlock,
        params,
        path,
    }: { isBlock: boolean; params: readonly Expression[]; path: PathExpression },
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
    const max = spec.variadic === true ? Number.POSITIVE_INFINITY : spec.args.length;
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
    if (spec.variadic === true) {
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
export function checkSpecialHelperArgs(
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
