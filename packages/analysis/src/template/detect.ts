/** Whether the decoded string holds a `{{`: a substring check, enough for HF501's warning. */
export function hasTemplateSyntax(decoded: string): boolean {
    return decoded.includes('{{');
}
