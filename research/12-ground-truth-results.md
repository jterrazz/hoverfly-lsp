# Ground-Truth Verification against Real Hoverfly

**Date:** 2026-06-11
**Hoverfly:** v1.12.8 (hoverfly + hoverctl both v1.12.8)
**Install:** `brew install SpectoLabs/tap/hoverfly` (built go 1.26.4 bottle + hoverfly 1.12.8 from tap)
**Method:** `hoverfly -response-body-files-path /tmp/hf-verify/bodyfiles` running (admin :8888, proxy :8500). Each fixture imported via `PUT /api/v2/simulation` (equivalent to `hoverctl import`, which posts the same payload). HTTP 200 = imported clean (or with `warnings` array); HTTP 400 = schema-validation rejection; HTTP 500 = semantic/import-time rejection.
**bodyFile setup:** only one valid fixture references a bodyFile (`response/bodyfile-only.hoverfly.json` -> `responses/catalog-200.json`). Created `/tmp/hf-verify/bodyfiles/responses/catalog-200.json` with dummy JSON. It imported clean.

---

## Headline result

**11 of 54 `valid/` fixtures are REJECTED by real Hoverfly v1.12.8.** The corpus claims every `valid/` file is a legal Hoverfly simulation; that is false for these 11. The dominant cause is a wrong shape for chained matchers: the corpus writes `"doMatch": [ {...} ]` (an array), but Hoverfly's official v5.x JSON schema requires `doMatch` to be a single **object** (one nested `RequestFieldMatcher`). One additional fixture fails because it references a `postServeAction` that is not registered with the running Hoverfly.

### Confirmation experiment (decisive)

- `doMatch` as **object** -> HTTP 200 (accepted).
- `doMatch` as **array** -> HTTP 400 `Invalid v5.3 simulation: [Error for <...doMatch>: Invalid type. Expected: object, given: array]`.

So the corpus's entire "array doMatch" convention is invalid Hoverfly. Any LSP that treats `doMatch: [ ... ]` as valid is wrong; Hoverfly's schema rejects it at import.

---

## valid/ fixtures — per-file results

### Imported clean (43)

hf4xx/login-flow; hf5xx/blocks-paths-requestbody; hf5xx/each-index-subexpr; hf5xx/vars-literals-faker-now; matchers/all-request-fields-combined; matchers/array-all-config-keys; matchers/array-on-multivalue-query; matchers/exact-default-and-explicit; matchers/form-on-body; matchers/glob-on-destination; matchers/json-on-body; matchers/jsonpartial-on-body; matchers/jsonpath-on-body; matchers/jwt-on-authorization-header; matchers/negate-on-path; matchers/regex-on-path; matchers/xml-on-body; matchers/xmltemplated-on-body; matchers/xpath-on-body; minimal; realworld/large-mixed-perf-canary; response/bodyfile-only; response/delays-fixed-and-lognormal; response/encoded-binary-png-body; response/labels-and-templated-headers; response/status-variants-and-multivalue-headers; response/transitions-and-removes-state; state/mixed-sequence-and-custom-state; state/required-in-one-pair-set-in-another; state/sequence-ordered-responses; templating/csv-data-sources; templating/escape-heavy-body-source-map-armor; templating/faker-pinned-types; templating/journal-and-context-state; templating/math-and-string-helpers; templating/raymond-builtins-blocks-and-subexpressions; templating/request-accessors; templating/templated-true-enables-body; templating/time-and-random-helpers; templating/validation-helpers-and-side-effects; templating/vars-literals-definitions; versions/v5_1-keyed-query; versions/v5-base-features.

### Import WARNINGS

None among the valid/ fixtures. (Warnings only appeared on invalid/ fixtures — see below.)

### Import ERRORS (11) — GOLD

All errors below are verbatim from the `PUT /api/v2/simulation` response body.

1. `valid/hf2xx/array-config-and-jsonpath-domatch.hoverfly.json` — HTTP 400
   `Invalid v5.3 simulation: [Error for <data.pairs.0.request.body.1.doMatch>: Invalid type. Expected: object, given: array]`
2. `valid/hf2xx/nested-transforming-domatch-and-casing.hoverfly.json` — HTTP 400
   `Invalid v5.3 simulation: [Error for <data.pairs.0.request.headers.X-Token.0.doMatch>: Invalid type. Expected: object, given: array; Error for <data.pairs.0.request.body.0.doMatch>: Invalid type. Expected: object, given: array]`
3. `valid/matchers/deep-domatch-jsonpath-chain.hoverfly.json` — HTTP 400
   `Invalid v5.3 simulation: [Error for <data.pairs.0.request.body.0.doMatch>: Invalid type. Expected: object, given: array]`
4. `valid/matchers/jwtjsonpath-on-authorization-header.hoverfly.json` — HTTP 400
   `Invalid v5.3 simulation: [Error for <data.pairs.0.request.headers.Authorization.0.doMatch>: Invalid type. Expected: object, given: array]`
5. `valid/realworld/ecommerce-catalog-and-cart.hoverfly.json` — HTTP 400
   `Invalid v5.3 simulation: [Error for <data.pairs.2.request.body.0.doMatch>: Invalid type. Expected: object, given: array]`
6. `valid/realworld/oauth2-token-and-userinfo.hoverfly.json` — HTTP 400
   `Invalid v5.3 simulation: [Error for <data.pairs.1.request.headers.Authorization.0.doMatch>: Invalid type. Expected: object, given: array]`
7. `valid/realworld/payment-intent-templated.hoverfly.json` — HTTP 400
   `Invalid v5.3 simulation: [Error for <data.pairs.0.request.body.0.doMatch>: Invalid type. Expected: object, given: array]`
8. `valid/rich-stateful-templated.hoverfly.json` — HTTP 400
   `Invalid v5.3 simulation: [Error for <data.pairs.1.request.body.0.doMatch>: Invalid type. Expected: object, given: array]`
9. `valid/state/login-fetch-update-logout-machine.hoverfly.json` — HTTP 400
   `Invalid v5.3 simulation: [Error for <data.pairs.0.request.body.0.doMatch>: Invalid type. Expected: object, given: array]`
10. `valid/versions/v5_2-array-jwt-form-domatch.hoverfly.json` — HTTP 400
    `Invalid v5.2 simulation: [Error for <data.pairs.0.request.headers.Authorization.0.doMatch>: Invalid type. Expected: object, given: array]`
11. `valid/response/postserveaction-and-fixeddelay.hoverfly.json` — HTTP 500
    `An error occurred: invalid post server action name provided`
    Root cause isolated: `postServeAction: "notifyDownstream"` references an action that is not registered with the running Hoverfly. Hoverfly validates the post-serve-action name at import time and rejects unknown names. (`fixedDelay: 75` alone imports fine — verified.) This means a `valid/` simulation cannot reference a postServeAction unless that action is registered; a pure-document LSP cannot know registration state, but the corpus labeling it "valid" is not portable.

**Note:** errors 1-10 share the same root cause (`doMatch` as array). Real Hoverfly only supports a single-object `doMatch`. The corpus uses arrays everywhere it chains matchers, so all chained-matcher fixtures are invalid against Hoverfly.

---

## invalid/ negative checks — observed vs claimed

Imported ~13 interesting invalid fixtures; fired proxy requests for the panic/runtime-claim ones.

### Hoverfly does NOT enforce these at import (imported HTTP 200, clean) — they are LSP-only lints

- `hf2xx/hf204-config-on-non-array` -> 200. (HF204 claims config-on-non-array rejection; Hoverfly accepts.)
- `matchers/hf204-config-on-exact` -> 200. (`config` on an `exact` matcher accepted.)
- `hf2xx/hf201-unknown-matcher` (`matcher: "xform"`) -> 200. Hoverfly does NOT reject unknown matcher names at import.
- `hf2xx/hf203-value-type-mismatch` (exact value = object; array value = string) -> 200. No type enforcement on matcher `value`.
- `hf3xx/hf304-status-out-of-range` (`status: 700`) -> 200. No status-range validation.
- `hf3xx/hf305-invalid-base64` (`encodedBody:true`, body `"this"`) -> 200. Invalid base64 accepted at import.
- `hf3xx/hf306-negative-fixed-delay` (`fixedDelay: -250`) -> 200; at runtime the delay is simply ignored (response served immediately, HTTP 200, process healthy).
- `hf2xx/hf211-empty-value-never-matches` (empty regex / empty jwtjsonpath) -> 200. Not rejected.

### Hoverfly emits WARNINGS at import (HTTP 200 with `warnings[]`) — not errors

- `hf3xx/hf301-body-and-bodyfile` -> `WARNING: Response contains both 'body' and 'bodyFile' ... otherwise 'body' is used if non empty`. So HF301 is a real Hoverfly warning, not an error.
- `hf3xx/hf302-content-length-transfer-encoding` -> two warnings: `Response contains both Content-Length and Transfer-Encoding headers ...` AND `Response contains incorrect Content-Length header ...`.
- `hf3xx/hf303-content-length-mismatch` -> `WARNING: Response contains incorrect Content-Length header ... please correct or remove header`.

### Hoverfly DOES reject at import (HTTP 500 / 400) — these LSP codes match real behavior

- `parse/broken-json` -> HTTP 400 `Invalid JSON`.
- `globalactions/hf601-delays-flagged-lognormal-gap` (bad delay regex) -> HTTP 500 `Response delay entry skipped due to invalid pattern : *invalid-leading-quantifier`.
- `globalactions/hf602-postserveaction-silent-without-settings` -> HTTP 500 `invalid post server action name provided` (same mechanism as valid-fixture error #11).
- `hf3xx/hf307-lognormal-delay-constraints` (mean/min > max) -> HTTP 500 `Config error - min delay must be less than max one`.

### Schema-version handling (HF103/HF104) — silent coercion, NOT rejection

- `hf1xx/hf103-legacy-schema-version` -> HTTP 200, returns `pairs: []` and rewrites meta to `schemaVersion: "v5.3"`. Legacy/old version is silently accepted but pairs are dropped (not parsed under that version).
- `hf1xx/hf104-unrecognized-schema-version` -> HTTP 200, same: `pairs: []`, meta coerced to v5.3. Unknown version is NOT rejected — it is silently swallowed with empty pairs. (An LSP error here is defensible since the user's pairs vanish, but Hoverfly does not error.)

### Templating runtime behavior (HF50x "parse error / crash" claims) — Hoverfly degrades gracefully, NO crash

All template-defect fixtures imported HTTP 200; fired through the proxy:

- `hf5xx/hf503-unknown-helper` (`{{notAHelper 'arg'}}`) -> HTTP 200, empty rendered body, process healthy.
- `templating/hf503-unknown-inline-call` (`{{randomMailbox 'corporate'}}`) -> HTTP 200, renders `{"email":""}` (unknown helper -> empty string).
- `templating/hf507-unknown-faker-near-miss` (`{{faker 'FullName'}}`) -> HTTP 200, renders `{"name":""}` (unknown faker type -> empty string).
- `templating/hf504-too-few-arguments` (`{{substring 'checkout' '0'}}`) -> HTTP 200, body passed through LITERALLY unrendered: `{"short":"{{substring 'checkout' '0'}}"}`.
- `templating/hf502-unclosed-mustache` (`{{faker 'Name'` with no close) -> HTTP 200, body returned LITERALLY unrendered, process healthy.

**Conclusion on HF50x:** real Hoverfly (raymond templating engine) never panics or returns 502 on bad templates. It either renders the helper to an empty string or passes the raw template text through. Any LSP diagnostic claiming a template defect causes a Hoverfly runtime crash / 502 / process panic is NOT borne out by v1.12.8. The defects are still worth flagging as authoring mistakes (silent empty output / literal passthrough is a bug for the user), but the _mechanism_ described as "crash/panic" is inaccurate.

---

## Summary of corpus-vs-Hoverfly mismatches (actionable)

1. **`doMatch` array vs object (severe):** 10 `valid/` fixtures use `"doMatch": [...]`. Hoverfly's schema requires a single object. These are flat-out invalid. The LSP must treat array `doMatch` as an error, not valid.
2. **`postServeAction` (portability):** referencing an unregistered post-serve action makes a sim un-importable (HTTP 500). The one valid fixture using it fails on a clean Hoverfly.
3. **Many HF2xx/HF3xx "rejection" codes are lint-only:** HF201, HF203, HF204, HF211, HF304, HF305, HF306 all import clean into Hoverfly. They are reasonable LSP lints but should not be described as "Hoverfly rejects".
4. **HF301/HF302/HF303 are Hoverfly WARNINGS**, not errors — wording should match.
5. **HF103/HF104 are silently coerced** (pairs dropped, version rewritten to v5.3), not hard-rejected.
6. **HF50x template defects do not crash Hoverfly** — graceful degradation (empty render or literal passthrough). Crash/panic/502 claims are inaccurate.
7. **Genuinely Hoverfly-enforced:** invalid JSON (400), bad delay regex (500), lognormal min>max (500), unknown postServeAction (500), schema-shape violations like array `doMatch` (400).

---

## Environment / cleanup

- Hoverfly process and body-files dir under `/tmp/hf-verify`. Hoverfly stopped after the run (`pkill`).
