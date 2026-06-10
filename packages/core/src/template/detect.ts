/**
 * Cheap "does this body contain template syntax?" scan, used by HF501 (template syntax present
 * while `templated` is absent/false). Intentionally a substring check, not a parse: it only
 * answers whether a mustache `{{` appears at all, with no allocation and no AST.
 */

/**
 * Whether the decoded string contains any `{{` mustache opener. Conservative and fast: a stray
 * `{{` is enough (HF501 is a warning), so no escaping or balance analysis is attempted here.
 */
export function hasTemplateSyntax(decoded: string): boolean {
  return decoded.includes("{{");
}
