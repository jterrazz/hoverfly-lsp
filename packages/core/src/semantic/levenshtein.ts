/**
 * Case-insensitive Levenshtein distance + nearest-candidate lookup, shared by the did-you-mean
 * diagnostics: HF603 (unknown structural key) and HF215/HF216 (method/scheme well-known value).
 *
 * Kept tiny and pure (no AST, no catalog). The "case-insensitive" choice mirrors Go's
 * case-folding for keys and the case-insensitive scheme comparison; for method values the
 * comparison is genuinely case-sensitive at runtime, but a near-miss measure that ignores case
 * still only ever fires on a typo, so folding is safe and consistent here.
 */

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

/**
 * The nearest candidate in `candidates` whose case-insensitive Levenshtein distance to `value` is
 * `<= maxDistance`, or `undefined` when none is close enough. Ties break alphabetically (stable,
 * deterministic golden output). A `value` that case-folds EXACTLY to a candidate has distance 0 and
 * is returned — callers that must exclude an exact match should check membership first.
 */
export function nearestWithin(
  value: string,
  candidates: readonly string[],
  maxDistance: number,
): string | undefined {
  let best: string | undefined;
  let bestDistance = maxDistance + 1;
  for (const candidate of candidates) {
    const distance = levenshtein(value, candidate);
    if (distance < bestDistance || (distance === bestDistance && candidate < (best ?? ""))) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best !== undefined && bestDistance <= maxDistance ? best : undefined;
}
