// outside: Hoverfly never validates method or scheme at import — a live v1.12.8 run stores `GT` and
// `htttp` verbatim, and ExactMatch compares strings (core/matching/matchers/exact_match.go) — so
// these sets are offered by completion and measured by HF215/HF216, never enforced.

// value: at a distance of 2, `ftp` and `tcp` would read as typos of `http`; at 1, every genuine
// typo (`GT`, `htttp`, `DELET`, `htps`) still fires and every custom value (`PURGE`, `MKCOL`,
// `ftp`) stays silent.
/** The did-you-mean distance for method and scheme, tighter than the structural keys' 2. */
export const VALUE_DID_YOU_MEAN_MAX_DISTANCE = 1;

// value: custom and WebDAV verbs (PURGE, PROPFIND, MKCOL) are legal and left out — in the
// did-you-mean set they would hide a genuine typo or flag a legitimate verb.
/** The IANA standard HTTP methods (RFC 9110 §9.3) completion offers and HF215 measures against. */
export const HTTP_METHODS: readonly string[] = [
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'DELETE',
    'CONNECT',
    'OPTIONS',
    'TRACE',
    'PATCH',
];

/** The schemes Hoverfly proxies, lowercase as it fills Request.Scheme. */
export const URI_SCHEMES: readonly string[] = ['http', 'https', 'ws', 'wss'];
