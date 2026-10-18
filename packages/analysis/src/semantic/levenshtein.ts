// value: case-insensitive. Go folds case for keys and schemes, and for a method a measure that
// ignores case still fires on a typo alone.

/** Case-insensitive Levenshtein edit distance between `a` and `b`. */
export function levenshtein(a: string, b: string): number {
    const s = a.toLowerCase();
    const t = b.toLowerCase();
    const rows = s.length + 1;
    const cols = t.length + 1;
    let previous = Array.from({ length: cols }, (_, index) => index);
    for (let i = 1; i < rows; i++) {
        const current = [i, ...Array.from({ length: cols - 1 }, () => 0)];
        for (let j = 1; j < cols; j++) {
            const cost = s[i - 1] === t[j - 1] ? 0 : 1;
            current[j] = Math.min(
                (current[j - 1] ?? 0) + 1,
                (previous[j] ?? 0) + 1,
                (previous[j - 1] ?? 0) + cost,
            );
        }
        previous = current;
    }
    return previous[cols - 1] ?? 0;
}

/** The nearest candidate within maxDistance, case-insensitively, ties broken alphabetically; an exact case-folded match is distance 0. */
export function nearestWithin(
    value: string,
    candidates: readonly string[],
    maxDistance: number,
): string | undefined {
    let best: string | undefined;
    let bestDistance = maxDistance + 1;
    for (const candidate of candidates) {
        const distance = levenshtein(value, candidate);
        if (distance < bestDistance || (distance === bestDistance && candidate < (best ?? ''))) {
            best = candidate;
            bestDistance = distance;
        }
    }
    return best !== undefined && bestDistance <= maxDistance ? best : undefined;
}
