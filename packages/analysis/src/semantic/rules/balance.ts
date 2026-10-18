// value: a lint, not a parser: brackets pair up and quotes close, a bracket inside a quote being
// text (research/14 §3.4, §3.6).

const CLOSERS: ReadonlyMap<string, string> = new Map([
    ['(', ')'],
    ['[', ']'],
    ['{', '}'],
]);
const CLOSING: ReadonlySet<string> = new Set(CLOSERS.values());

/** Whether every bracket closes in order and every quote closes, a quoted bracket left as text. */
export function isBalanced(s: string): boolean {
    const stack: string[] = [];
    let quote: string | undefined;
    for (const ch of s) {
        if (quote !== undefined) {
            quote = ch === quote ? undefined : quote;
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }
        const closer = CLOSERS.get(ch);
        if (closer !== undefined) {
            stack.push(closer);
        } else if (CLOSING.has(ch) && stack.pop() !== ch) {
            return false;
        }
    }
    return stack.length === 0 && quote === undefined;
}
