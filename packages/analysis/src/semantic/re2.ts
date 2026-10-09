// outside: Hoverfly compiles every regex with Go's regexp, an RE2 engine — it refuses the
// lookarounds and backreferences JavaScript accepts and accepts the `(?P<name>…)` JavaScript
// refuses, so `new RegExp` is wrong both ways (research/14 §3.1); re2js is the pure-JS port of
// RE2J, the grammar Go uses.

import { RE2JS } from 're2js';

// value: where re2js is more permissive than Go, a pattern Go refuses is missed — a false negative,
// never a false positive (research/14 §3.1).
/** Whether a pattern compiles under Go's RE2 engine, as Hoverfly would accept it; never throws. */
export function isValidRe2(pattern: string): boolean {
    try {
        RE2JS.compile(pattern);
        return true;
    } catch {
        return false;
    }
}
