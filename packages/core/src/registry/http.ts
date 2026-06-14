/**
 * Well-known value sets for the `request.method` and `request.scheme` fields. Pure data; the
 * value-completion path and the HF215/HF216 did-you-mean rule consume it. No logic lives here.
 *
 * ## Ground truth, both fields are OPEN sets, compared VERBATIM (do not over-enforce)
 * Verified against real Hoverfly v1.12.8 (`PUT /api/v2/simulation`, 2026-06-11) and the Go source
 * (`core/handlers/v2/simulation_views.go` → `Method []MatcherViewV5` / `Scheme []MatcherViewV5`;
 * `core/matching/matchers/exact_match.go` → `ExactMatch` type-asserts the value to a `string` and
 * does a plain equality compare). Hoverfly NEVER validates either value-domain at import:
 *
 *   - `method:"GT"`     → HTTP 200, stored verbatim (custom/extension verbs are spec-legal).
 *   - `scheme:"htttp"`  → HTTP 200, stored verbatim.
 *   - `method:"GETT"`, `scheme:"ftp"`, `destination:"http://host/path"` → all 200 (research/13 T19).
 *
 * Consequences (the zero-false-positive policy is LAW):
 *   - COMPLETION is always safe: it only OFFERS the well-known values; it never rejects others.
 *   - DIAGNOSTIC is HINT-only and fires ONLY on a near-miss (Levenshtein ≤ the did-you-mean
 *     distance) against the standard set, a typo. A value that is NOT close to any standard value
 *     (a bespoke verb like `PURGE`/`PROPFIND`, a custom scheme) stays SILENT: it is a plausible
 *     custom value, not a typo.
 *   - Both gated on the `exact` (or absent/default-exact) matcher only. A `glob`/`regex`/etc. value
 *     is a pattern, never an enum, so neither completion nor the hint applies.
 */

/**
 * The did-you-mean Levenshtein threshold for the OPEN value domains (method/scheme), DELIBERATELY
 * tighter than the structural-key `DID_YOU_MEAN_MAX_DISTANCE` (2). These value sets are short, so a
 * distance-2 match is unsafe: `ftp`/`tcp` are within edit-distance 2 of `http`, and `ftp` is a
 * perfectly legal scheme, flagging it would be a false positive (the zero-false-positive LAW). At
 * distance 1, every genuine typo (`GT`→`GET`, `htttp`→`http`, `DELET`→`DELETE`, `OPTONS`→`OPTIONS`,
 * `htps`→`https`) still fires while every plausible custom value (`PURGE`, `PROPFIND`, `MKCOL`,
 * `ftp`, `gopher`, `tcp`) stays silent. Verified by an exhaustive distance sweep (commit message).
 */
export const VALUE_DID_YOU_MEAN_MAX_DISTANCE = 1;

/**
 * The IANA HTTP Method Registry standard methods (RFC 9110 §9 + the registry). These nine are the
 * universally-recognised verbs; they are what completion OFFERS and what the HF215 did-you-mean
 * hint measures a near-miss against. Custom/WebDAV verbs (PURGE, PROPFIND, MKCOL, …) are spec-legal
 * and deliberately NOT listed: including them in the did-you-mean set would either suppress genuine
 * typos or, worse, flag a legitimate custom verb, so the set is intentionally the core registry.
 *
 * Source: <https://www.iana.org/assignments/http-methods/http-methods.xhtml> (standard methods),
 * RFC 9110 (HTTP Semantics) §9.3.
 */
export const HTTP_METHODS: readonly string[] = [
  "GET",
  "HEAD",
  "POST",
  "PUT",
  "DELETE",
  "CONNECT",
  "OPTIONS",
  "TRACE",
  "PATCH",
];

/**
 * The URI schemes Hoverfly meaningfully proxies. `http`/`https` are the everyday case; `ws`/`wss`
 * are supported for WebSocket setups (research/13 §3.2). Hoverfly string-compares the scheme
 * verbatim, so any other scheme (`ftp`, custom) is legal and imports clean, it just stays SILENT
 * (no near-miss against this set). Lowercase is canonical: schemes are case-insensitive per RFC
 * 3986 §3.1, and Hoverfly populates `Request.Scheme` lowercased.
 *
 * Source: RFC 3986 §3.1 (scheme syntax); Hoverfly request-field population (`Request.Scheme`).
 */
export const URI_SCHEMES: readonly string[] = ["http", "https", "ws", "wss"];
