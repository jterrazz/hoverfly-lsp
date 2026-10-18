// invariant: a matcher's documentation describes that matcher alone; the generic unknown-name and
// config-misuse panics are HF201's and HF204's, raised where the mistake is made.

import type { MatcherSpec } from '../registry/matchers.js';

function valueTypeLine(spec: MatcherSpec): string {
    return `**Value type:** \`${spec.valueType}\``;
}

function configLine(spec: MatcherSpec): string {
    if (spec.supportsConfig) {
        const keys = (spec.configKeys ?? []).map((k) => `\`${k}\``).join(', ');
        return `**Config:** supported, booleans ${keys}.`;
    }
    return '**Config:** not supported.';
}

function matcherSpecificNotes(spec: MatcherSpec): string[] {
    const notes: string[] = [];
    if (spec.supportsConfig) {
        notes.push(
            '**Warning:** each `config` value must be a JSON boolean; a string like `"true"` or a number is a mistake.',
        );
    }
    if (spec.bodyOnly === true) {
        notes.push(
            '**Warning:** valid ONLY on the request `body`, only as a top-level matcher, and case-SENSITIVE (`form`, not `Form`/`FORM`).',
        );
    }
    if (spec.wrongTypeBehavior === 'vacuous-true') {
        notes.push(
            '**Warning:** a non-string value matches vacuously (always true), which is almost always a mistake.',
        );
    }
    return notes;
}

/** The Markdown documentation of a matcher, for a completion item and a hover. */
export function matcherMarkdown(spec: MatcherSpec): string {
    const displayName = spec.name === '' ? '(default / empty matcher)' : spec.name;
    const lines: string[] = [
        `### \`${displayName}\` matcher`,
        '',
        spec.docs,
        '',
        valueTypeLine(spec),
        configLine(spec),
    ];
    if (spec.doMatchTransforms) {
        lines.push(
            '**doMatch:** transforms/extracts a value for the next chained matcher (not a re-test of the same input).',
        );
    } else {
        lines.push('**doMatch:** AND-semantics; re-tests the same input against the next matcher.');
    }
    const notes = matcherSpecificNotes(spec);
    if (notes.length > 0) {
        lines.push('', ...notes);
    }
    return lines.join('\n');
}

/** A short one-line `detail` string for a completion item (shown inline next to the label). */
export function matcherDetail(spec: MatcherSpec): string {
    const suffix = spec.bodyOnly === true ? ' (body only)' : '';
    return `Hoverfly matcher · value: ${spec.valueType}${suffix}`;
}
