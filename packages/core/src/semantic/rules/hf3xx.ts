/**
 * HF3xx — response-field rules. All consume the typed {@link SimulationModel} response view,
 * including the `fixedDelay`/`logNormalDelay` accessors the framework model now exposes — no
 * raw-AST re-walking of matcher/state shapes.
 *
 *   HF301  W  `body` and `bodyFile` both set (range = bodyFile key).
 *   HF302  W  `Content-Length` and `Transfer-Encoding` response headers both set
 *             (range = the second header's key).
 *   HF303  W  `Content-Length` value ≠ UTF-8 byte length of `body`
 *             (skip when `templated`/`bodyFile`/`encodedBody`; range = header value).
 *   HF304  W  `status` outside 100–599 (range = status value).
 *   HF305  W  `encodedBody: true` but `body` is not valid (standard, padded) base64
 *             (range = body value).
 *   HF306  W  negative `fixedDelay` (range = the value).
 *   HF307  W  `logNormalDelay` constraint violation (range = the offending field).
 *
 * Verified against SpectoLabs/hoverfly master (see this rule family's report notes):
 *   - HF305: `core/models/payload.go` does `decoded, _ := base64.StdEncoding.DecodeString(body)`
 *            — the decode error is DISCARDED, so an invalid value is silently truncated to
 *            garbage at response time (no import failure, no panic). Severity W is correct.
 *   - HF306: `core/hoverfly.go applyResponseDelay` guards `if result.FixedDelay > 0` — a
 *            negative (or zero) fixedDelay is silently ignored. Severity W is correct.
 *   - HF307: `core/delay/log_normal_generator.go ValidateLogNormalDelayOptions` — its exact
 *            constraint set is mirrored in {@link logNormalDelayViolation}. NOTE: in Hoverfly
 *            this validation HARD-FAILS the import (`core/import.go` SetError+break), so the
 *            real-world severity is arguably Error; the frozen catalog pins HF307 to Warning
 *            and severities come from the catalog, so this rule emits Warning. Flagged in the
 *            family report as a catalog-vs-reality deviation for the integrator to weigh.
 */

import type { ASTNode, ObjectASTNode } from "vscode-json-languageservice";
import type { Diagnostic } from "vscode-languageserver-types";

import { makeDiagnostic } from "../diagnostics.js";
import type { ResponseModel, RuleContext, SemanticRule } from "../types.js";

/** Lowest / highest HTTP status codes Hoverfly treats as in-range (inclusive). */
const MIN_HTTP_STATUS = 100;
const MAX_HTTP_STATUS = 599;

/** Standard, padded base64 alphabet (Go `base64.StdEncoding`): no URL-safe chars, padding required. */
const BASE64_STD_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Header names whose simultaneous presence (HF302) is an invalid combination. */
const CONTENT_LENGTH = "content-length";
const TRANSFER_ENCODING = "transfer-encoding";

/* ----------------------------------- local AST helpers ----------------------------------- */

/** Whether a boolean-valued response field is present and `true`. */
function isTrue(node: ASTNode | undefined): boolean {
  return node?.type === "boolean" && node.value === true;
}

/** The numeric value of a node when it is a JSON number, else undefined. */
function numberValue(node: ASTNode | undefined): number | undefined {
  return node?.type === "number" ? node.value : undefined;
}

/** UTF-8 byte length of a string (HF303 must compare bytes, not code units). */
const UTF8 = new TextEncoder();
function byteLength(text: string): number {
  return UTF8.encode(text).length;
}

/* --------------------------------------- HF301 ------------------------------------------- */

/** `body` AND `bodyFile` both present — body wins, bodyFile silently ignored. */
function hf301(response: ResponseModel, context: RuleContext): Diagnostic[] {
  const { body, bodyFile } = response;
  if (body.propertyNode && bodyFile.propertyNode && bodyFile.keyNode) {
    return [makeDiagnostic(context.textDocument, "HF301", bodyFile.keyNode)];
  }
  return [];
}

/* --------------------------------------- HF302 ------------------------------------------- */

/** `Content-Length` AND `Transfer-Encoding` headers both set (case-insensitive names). */
function hf302(response: ResponseModel, context: RuleContext): Diagnostic[] {
  let contentLength: ASTNode | undefined;
  let transferEncoding: ASTNode | undefined;
  for (const header of response.headers) {
    const name = header.name.toLowerCase();
    if (name === CONTENT_LENGTH) {
      contentLength ??= header.keyNode;
    } else if (name === TRANSFER_ENCODING) {
      transferEncoding ??= header.keyNode;
    }
  }
  if (!contentLength || !transferEncoding) {
    return [];
  }
  // Range = the SECOND header key (the later one in document order) per the catalog.
  const second = contentLength.offset > transferEncoding.offset ? contentLength : transferEncoding;
  return [makeDiagnostic(context.textDocument, "HF302", second)];
}

/* --------------------------------------- HF303 ------------------------------------------- */

/** First value-string of a header (`name: ["v"]` or `name: "v"`), with its node. */
function firstHeaderString(valueNode: ASTNode | undefined): ASTNode | undefined {
  if (valueNode?.type === "string") {
    return valueNode;
  }
  if (valueNode?.type === "array") {
    const first = valueNode.items[0];
    return first?.type === "string" ? first : undefined;
  }
  return undefined;
}

/** `Content-Length` header value disagrees with the actual UTF-8 body length. */
function hf303(response: ResponseModel, context: RuleContext): Diagnostic[] {
  // Skip when the body is not a literal we can measure.
  if (
    isTrue(response.templated.valueNode) ||
    isTrue(response.encodedBody.valueNode) ||
    response.bodyFile.propertyNode
  ) {
    return [];
  }
  const bodyNode = response.body.valueNode;
  if (bodyNode?.type !== "string") {
    return [];
  }

  const header = response.headers.find((h) => h.name.toLowerCase() === CONTENT_LENGTH);
  const valueNode = firstHeaderString(header?.valueNode);
  if (!valueNode || valueNode.type !== "string") {
    return [];
  }
  // Only act on a well-formed integer Content-Length; anything else is a schema/other concern.
  if (!/^\d+$/.test(valueNode.value)) {
    return [];
  }

  const declared = Number(valueNode.value);
  const actual = byteLength(bodyNode.value);
  if (declared === actual) {
    return [];
  }
  return [makeDiagnostic(context.textDocument, "HF303", valueNode, { n: declared, m: actual })];
}

/* --------------------------------------- HF304 ------------------------------------------- */

/** `status` outside the 100–599 HTTP range. */
function hf304(response: ResponseModel, context: RuleContext): Diagnostic[] {
  const valueNode = response.status.valueNode;
  const status = numberValue(valueNode);
  if (valueNode === undefined || status === undefined) {
    return [];
  }
  if (status >= MIN_HTTP_STATUS && status <= MAX_HTTP_STATUS) {
    return [];
  }
  return [makeDiagnostic(context.textDocument, "HF304", valueNode, { n: status })];
}

/* --------------------------------------- HF305 ------------------------------------------- */

/** `encodedBody: true` but `body` is not valid standard (padded) base64. */
function hf305(response: ResponseModel, context: RuleContext): Diagnostic[] {
  if (!isTrue(response.encodedBody.valueNode)) {
    return [];
  }
  const bodyNode = response.body.valueNode;
  if (bodyNode?.type !== "string") {
    // No string body to validate (e.g. bodyFile-based or absent) — not our concern.
    return [];
  }
  const body = bodyNode.value;
  // The empty string is valid base64 (decodes to empty); only flag non-empty invalid values.
  if (body.length === 0 || BASE64_STD_PATTERN.test(body)) {
    return [];
  }
  return [makeDiagnostic(context.textDocument, "HF305", bodyNode)];
}

/* --------------------------------------- HF306 ------------------------------------------- */

/** Negative `fixedDelay` — silently ignored by Hoverfly (`if FixedDelay > 0`). */
function hf306(response: ResponseModel, context: RuleContext): Diagnostic[] {
  const valueNode = response.fixedDelay.valueNode;
  const delay = numberValue(valueNode);
  if (valueNode === undefined || delay === undefined || delay >= 0) {
    return [];
  }
  return [makeDiagnostic(context.textDocument, "HF306", valueNode)];
}

/* --------------------------------------- HF307 ------------------------------------------- */

/** A `logNormalDelay` field plus its numeric value (NaN/undefined when absent or non-number). */
interface LogNormalFields {
  readonly object: ObjectASTNode;
  readonly min: number | undefined;
  readonly max: number | undefined;
  readonly mean: number | undefined;
  readonly median: number | undefined;
  readonly node: (key: string) => ASTNode | undefined;
}

/**
 * Evaluate Hoverfly's `ValidateLogNormalDelayOptions` constraint set against a logNormalDelay
 * object and return the FIRST violation (offending node + explanation), mirroring Go's order.
 * Returns undefined when every constraint holds (or there is nothing to check yet).
 *
 * Go source (core/delay/log_normal_generator.go), in order:
 *   1. max < 0 || min < 0           → "delay min and max can't be less than 0"
 *   2. mean <= 0 || median <= 0     → "delay mean and median params can't be less or equals 0"
 *   3. if max != 0: max < min       → "min delay must be less than max one"
 *   4. if max != 0: mean > max      → "mean delay can't be greather than max one"
 *   5. if max != 0: median > max    → "median delay can't be and greather than max one"
 *   6. if min != 0: mean < min      → "mean delay can't be less than min one"
 *   7. if min != 0: median < min    → "median delay can't be less than min one"
 *   8. median > mean                → "mean delay can't be less than median one"
 *
 * Each constraint requires its inputs to be present numbers; absent fields default to 0 at the
 * Go layer (zero-value int), so we mirror that by treating an absent/non-number field as 0 —
 * EXCEPT constraint 2 (mean/median), where an absent field genuinely means "0" and thus fails,
 * matching Go (a missing mean is the int zero-value and `mean <= 0` fires).
 */
function logNormalDelayViolation(
  fields: LogNormalFields,
): undefined | { node: ASTNode; explain: string } {
  const min = fields.min ?? 0;
  const max = fields.max ?? 0;
  const mean = fields.mean ?? 0;
  const median = fields.median ?? 0;

  const at = (key: string, explain: string): { node: ASTNode; explain: string } => ({
    node: fields.node(key) ?? fields.object,
    explain,
  });

  if (max < 0) {
    return at("max", "logNormalDelay min and max cannot be less than 0");
  }
  if (min < 0) {
    return at("min", "logNormalDelay min and max cannot be less than 0");
  }
  if (mean <= 0) {
    return at("mean", "logNormalDelay mean and median cannot be less than or equal to 0");
  }
  if (median <= 0) {
    return at("median", "logNormalDelay mean and median cannot be less than or equal to 0");
  }
  if (max !== 0) {
    if (max < min) {
      return at("max", "logNormalDelay min must be less than max");
    }
    if (mean > max) {
      return at("mean", "logNormalDelay mean cannot be greater than max");
    }
    if (median > max) {
      return at("median", "logNormalDelay median cannot be greater than max");
    }
  }
  if (min !== 0) {
    if (mean < min) {
      return at("mean", "logNormalDelay mean cannot be less than min");
    }
    if (median < min) {
      return at("median", "logNormalDelay median cannot be less than min");
    }
  }
  if (median > mean) {
    return at("median", "logNormalDelay mean cannot be less than median");
  }
  return undefined;
}

/** Read the logNormalDelay object (if present) into a {@link LogNormalFields} view. */
function readLogNormal(response: ResponseModel): LogNormalFields | undefined {
  const node = response.logNormalDelay.valueNode;
  if (node?.type !== "object") {
    return undefined;
  }
  const value = (key: string): ASTNode | undefined =>
    node.properties.find((p) => p.keyNode.value === key)?.valueNode;
  return {
    object: node,
    min: numberValue(value("min")),
    max: numberValue(value("max")),
    mean: numberValue(value("mean")),
    median: numberValue(value("median")),
    node: value,
  };
}

/** `logNormalDelay` violates Hoverfly's validation (which hard-fails import — see header). */
function hf307(response: ResponseModel, context: RuleContext): Diagnostic[] {
  const fields = readLogNormal(response);
  if (!fields) {
    return [];
  }
  const violation = logNormalDelayViolation(fields);
  if (!violation) {
    return [];
  }
  return [
    makeDiagnostic(context.textDocument, "HF307", violation.node, { explain: violation.explain }),
  ];
}

/* ----------------------------------------- rule ------------------------------------------ */

/** The single HF3xx rule: one pass over every pair's response. */
export const hf3xxResponseRule: SemanticRule = {
  codes: ["HF301", "HF302", "HF303", "HF304", "HF305", "HF306", "HF307"],
  run(context): Diagnostic[] {
    const out: Diagnostic[] = [];
    for (const pair of context.model.pairs) {
      const { response } = pair;
      if (!response.node) {
        continue;
      }
      out.push(
        ...hf301(response, context),
        ...hf302(response, context),
        ...hf303(response, context),
        ...hf304(response, context),
        ...hf305(response, context),
        ...hf306(response, context),
        ...hf307(response, context),
      );
    }
    return out;
  },
};

/** All HF3xx rules. The integrator spreads this into `rules/index.ts#ALL_RULES`. */
export const HF3XX_RULES: readonly SemanticRule[] = [hf3xxResponseRule];
