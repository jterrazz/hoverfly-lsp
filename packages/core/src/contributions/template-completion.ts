/**
 * Completion provider for positions INSIDE templated Hoverfly strings — the flagship feature.
 *
 * Driven from `service.ts` (which holds the cursor {@link Position}; the `JSONWorkerContribution`
 * API does not expose it). Given a document position, this:
 *
 *   1. asks {@link findTemplateLocation} whether the cursor is inside a templatable body/header
 *      string (templated:true, or already containing `{{` — mid-typing);
 *   2. classifies the decoded-offset cursor with {@link classifyCompletionContext};
 *   3. emits the right completion items for that context, sourcing helper/faker facts from the
 *      registry and `Request.*`/path-root data from {@link template-members}, and cross-referencing
 *      `State`/`Vars`/`Literals` names from the document itself.
 *
 * Every helper/faker fact comes from the registry; no helper/faker name is hardcoded here.
 */

import type { ASTNode, JSONDocument, ObjectASTNode, Position } from "vscode-json-languageservice";
import type { TextDocument } from "vscode-languageserver-textdocument";
import {
  type CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
} from "vscode-languageserver-types";

import { ALL_HELPERS, FAKER_NAMES, type HelperSpec, NOW_FORMAT_NOTES } from "../registry/index.js";
import {
  classifyCompletionContext,
  type TemplateCompletionContext,
} from "../template/completion-context.js";
import { findTemplateLocation } from "./template-location.js";
import { EACH_DATA_VARIABLES, PATH_ROOTS, REQUEST_MEMBERS } from "./template-members.js";

/** `now` format examples to surface in the `format` argument slot (registry-derived notes). */
const NOW_FORMAT_EXAMPLES: ReadonlyArray<{ value: string; detail: string }> = [
  { value: "", detail: "RFC3339 (default)" },
  { value: "unix", detail: "Unix seconds" },
  { value: "epoch", detail: "milliseconds (misnamed)" },
  { value: "2006-01-02", detail: "Go layout: date" },
  { value: "2006-01-02T15:04:05Z07:00", detail: "Go layout: RFC3339" },
];

/** A few representative `now` OFFSET examples (units come from the registry note). */
const NOW_OFFSET_EXAMPLES: readonly string[] = ["-1d", "+1h", "-30m", "1y", "-1.5h"];

/**
 * Produce template completion items for `position`, or `undefined` when the cursor is not inside
 * a templatable string (the caller then falls back to schema/JSON completions). Never throws.
 */
function getTemplateCompletions(
  document: TextDocument,
  jsonDocument: JSONDocument,
  position: Position,
): CompletionItem[] | undefined {
  const offset = document.offsetAt(position);
  const location = findTemplateLocation(document, jsonDocument, offset);
  if (!location) {
    return undefined;
  }

  const context = classifyCompletionContext(location.decoded, location.decodedCursor);
  if (context.kind === "none") {
    return undefined;
  }
  return itemsForContext(context, jsonDocument);
}

/* --------------------------------- context → items dispatch ------------------------------ */

function itemsForContext(
  context: TemplateCompletionContext,
  jsonDocument: JSONDocument,
): CompletionItem[] {
  switch (context.kind) {
    case "helperOrPathStart": {
      return startItems(context, jsonDocument);
    }
    case "pathContinuation": {
      return pathContinuationItems(context, jsonDocument);
    }
    case "fakerArg": {
      return fakerItems();
    }
    case "nowArg": {
      return context.nowSlot === "format" ? nowFormatItems() : nowOffsetItems();
    }
    case "helperArg": {
      // Inside a generic helper arg: still useful to offer path roots / helpers as values.
      return [...pathRootItems(), ...helperItems(context)];
    }
    case "blockClose": {
      return blockCloseItems(context);
    }
    default: {
      return [];
    }
  }
}

/* ------------------------------------- item builders ------------------------------------- */

/** Helper names + path roots + (in #each scope) `@`-vars / `this` at a mustache/subexpr head. */
function startItems(
  context: TemplateCompletionContext,
  jsonDocument: JSONDocument,
): CompletionItem[] {
  const items: CompletionItem[] = [...helperItems(context), ...pathRootItems()];
  if (context.inEachScope) {
    items.push(...dataVariableItems(), thisItem());
  }
  // State/Vars/Literals roots are offered via pathRootItems; their *members* come on continuation.
  void jsonDocument;
  return items;
}

/** All 52+8 helpers as snippet completions with argument placeholders. */
function helperItems(context: TemplateCompletionContext): CompletionItem[] {
  return ALL_HELPERS.map((spec) => helperItem(spec, context));
}

function helperItem(spec: HelperSpec, context: TemplateCompletionContext): CompletionItem {
  const signature = helperSignature(spec);
  return {
    label: spec.name,
    kind: spec.block ? CompletionItemKind.Function : CompletionItemKind.Method,
    detail: `${signature}${spec.builtin ? " · raymond built-in" : " · Hoverfly helper"}`,
    documentation: {
      kind: MarkupKind.Markdown,
      value: [`\`${signature}\``, "", spec.docs, "", `Example: \`${spec.example}\``].join("\n"),
    },
    // Insert just the name + arg placeholders; the caller already typed `{{`/`(`/`#`.
    insertText: helperInsertText(spec, context),
    insertTextFormat: InsertTextFormat.Snippet,
  };
}

/** A human-readable helper signature line (`replace target oldValue newValue`). */
function helperSignature(spec: HelperSpec): string {
  const args = spec.args.map((a) => (a.optional ? `[${a.name}]` : a.name));
  if (spec.variadic) {
    args.push("…");
  }
  const prefix = spec.block ? "#" : "";
  return [`${prefix}${spec.name}`, ...args].join(" ");
}

/**
 * Snippet insert text for a helper: its name followed by `${n:arg}` placeholders, and — for block
 * helpers — the body + matching `{{/name}}` close so the block is balanced in one keystroke.
 */
function helperInsertText(spec: HelperSpec, context: TemplateCompletionContext): string {
  const open = "$".concat("{");
  const placeholders = spec.args.map((arg, i) => `${open}${i + 1}:${arg.name}}`);
  const argsPart = placeholders.length > 0 ? ` ${placeholders.join(" ")}` : "";

  if (!spec.block) {
    return `${spec.name}${argsPart}`;
  }
  // Block helper: only complete the full block when starting a fresh mustache head. When the user
  // Already typed `#`, the head token alone is enough — but we still close the block helpfully.
  const bodyStop = `${open}${spec.args.length + 1}:body}`;
  void context;
  return `${spec.name}${argsPart}}}${bodyStop}{{/${spec.name}`;
}

/** The dotted path roots (`Request`/`State`/`Vars`/`Literals`). */
function pathRootItems(): CompletionItem[] {
  return PATH_ROOTS.map((root) => ({
    label: root.name,
    kind: CompletionItemKind.Variable,
    detail: "Template data root",
    documentation: { kind: MarkupKind.Markdown, value: root.docs },
    insertText: root.name,
    insertTextFormat: InsertTextFormat.PlainText,
  }));
}

/** `@index`/`@first`/`@last`/`@key` items (used in #each scope). */
function dataVariableItems(): CompletionItem[] {
  return EACH_DATA_VARIABLES.map((variable) => ({
    label: `@${variable.name}`,
    kind: CompletionItemKind.Variable,
    detail: "#each data variable",
    documentation: { kind: MarkupKind.Markdown, value: variable.docs },
    insertText: `@${variable.name}`,
    insertTextFormat: InsertTextFormat.PlainText,
  }));
}

function thisItem(): CompletionItem {
  return {
    label: "this",
    kind: CompletionItemKind.Variable,
    detail: "Current #each element",
    documentation: {
      kind: MarkupKind.Markdown,
      value: "The current element inside an `#each` block (use `this.<field>` for object fields).",
    },
    insertText: "this",
    insertTextFormat: InsertTextFormat.PlainText,
  };
}

/** Continuation members for a dotted path (`Request.`, `State.`, `Vars.`, `Literals.`, `@`). */
function pathContinuationItems(
  context: TemplateCompletionContext,
  jsonDocument: JSONDocument,
): CompletionItem[] {
  const root = context.path?.root ?? "";
  if (root === "@") {
    return dataVariableItems();
  }
  if (root === "Request") {
    return requestMemberItems();
  }
  if (root === "State") {
    return stateKeyItems(jsonDocument);
  }
  if (root === "Vars") {
    return dataNameItems(jsonDocument, "variables", "Declared variable (data.variables)");
  }
  if (root === "Literals") {
    return dataNameItems(jsonDocument, "literals", "Declared literal (data.literals)");
  }
  return [];
}

/** The `Request.*` accessor members. */
function requestMemberItems(): CompletionItem[] {
  return REQUEST_MEMBERS.map((member) => ({
    label: member.name,
    kind: member.methodCall ? CompletionItemKind.Method : CompletionItemKind.Field,
    detail: member.methodCall ? "Request accessor (method call)" : "Request field",
    documentation: { kind: MarkupKind.Markdown, value: member.docs },
    insertText: member.name,
    insertTextFormat: InsertTextFormat.PlainText,
  }));
}

/** Faker type names (the 210 zero-arg gofakeit names) as plain completions. */
function fakerItems(): CompletionItem[] {
  return FAKER_NAMES.map((name) => ({
    label: name,
    kind: CompletionItemKind.Value,
    detail: "gofakeit zero-arg type",
    insertText: name,
    insertTextFormat: InsertTextFormat.PlainText,
  }));
}

/** `now` format-string examples (RFC3339 / unix / epoch / Go layouts). */
function nowFormatItems(): CompletionItem[] {
  const items: CompletionItem[] = NOW_FORMAT_EXAMPLES.map((example) => ({
    label: example.value === "" ? "(empty → RFC3339)" : example.value,
    kind: CompletionItemKind.Value,
    detail: example.detail,
    documentation: { kind: MarkupKind.Markdown, value: NOW_FORMAT_NOTES.formats },
    insertText: example.value,
    insertTextFormat: InsertTextFormat.PlainText,
  }));
  return items;
}

/** `now` offset-string examples + the supported-units note (registry-derived). */
function nowOffsetItems(): CompletionItem[] {
  return NOW_OFFSET_EXAMPLES.map((offset) => ({
    label: offset,
    kind: CompletionItemKind.Value,
    detail: "now offset",
    documentation: { kind: MarkupKind.Markdown, value: NOW_FORMAT_NOTES.units },
    insertText: offset,
    insertTextFormat: InsertTextFormat.PlainText,
  }));
}

/** Matching open-block names for a `{{/<cursor>` close (innermost first). */
function blockCloseItems(context: TemplateCompletionContext): CompletionItem[] {
  const seen = new Set<string>();
  const items: CompletionItem[] = [];
  // Innermost block first (so the most likely close sorts first).
  for (let i = context.blockStack.length - 1; i >= 0; i -= 1) {
    const name = context.blockStack[i];
    if (name === undefined || name.length === 0 || seen.has(name)) {
      continue;
    }
    seen.add(name);
    items.push({
      label: name,
      kind: CompletionItemKind.Keyword,
      detail: "Close open block",
      insertText: name,
      insertTextFormat: InsertTextFormat.PlainText,
      sortText: String(context.blockStack.length - i).padStart(3, "0"),
    });
  }
  return items;
}

/* ------------------------------- document cross-references ------------------------------- */

/** `State.<key>` completions: every state key declared anywhere in the simulation. */
function stateKeyItems(jsonDocument: JSONDocument): CompletionItem[] {
  const keys = collectStateKeys(jsonDocument);
  return [...keys].sort().map((key) => ({
    label: key,
    kind: CompletionItemKind.Variable,
    detail: "State key (declared in this simulation)",
    insertText: key,
    insertTextFormat: InsertTextFormat.PlainText,
  }));
}

/** `Vars.<name>` / `Literals.<name>` completions read from `data.variables`/`data.literals`. */
function dataNameItems(
  jsonDocument: JSONDocument,
  dataKey: "literals" | "variables",
  detail: string,
): CompletionItem[] {
  const names = collectDataNames(jsonDocument, dataKey);
  return [...names].sort().map((name) => ({
    label: name,
    kind: CompletionItemKind.Variable,
    detail,
    insertText: name,
    insertTextFormat: InsertTextFormat.PlainText,
  }));
}

/** Every distinct `requiresState`/`transitionsState` key across the file. */
function collectStateKeys(jsonDocument: JSONDocument): Set<string> {
  const keys = new Set<string>();
  const root = asObject(jsonDocument.root);
  const data = asObject(propValue(root, "data"));
  for (const pairNode of arrayItems(data, "pairs")) {
    const pair = asObject(pairNode);
    const request = asObject(propValue(pair, "request"));
    const response = asObject(propValue(pair, "response"));
    addObjectKeys(propValue(request, "requiresState"), keys);
    addObjectKeys(propValue(response, "transitionsState"), keys);
  }
  return keys;
}

/** Every `name` in `data.<dataKey>[]` (variables/literals). */
function collectDataNames(
  jsonDocument: JSONDocument,
  dataKey: "literals" | "variables",
): Set<string> {
  const names = new Set<string>();
  const root = asObject(jsonDocument.root);
  const data = asObject(propValue(root, "data"));
  for (const entry of arrayItems(data, dataKey)) {
    const obj = asObject(entry);
    const nameNode = propValue(obj, "name");
    if (nameNode?.type === "string" && nameNode.value.length > 0) {
      names.add(nameNode.value);
    }
  }
  return names;
}

/* --------------------------------------- AST helpers ------------------------------------- */

function asObject(node: ASTNode | undefined): ObjectASTNode | undefined {
  return node?.type === "object" ? node : undefined;
}

function propValue(node: ObjectASTNode | undefined, key: string): ASTNode | undefined {
  return node?.properties.find((p) => p.keyNode.value === key)?.valueNode;
}

function arrayItems(node: ObjectASTNode | undefined, key: string): readonly ASTNode[] {
  const value = propValue(node, key);
  return value?.type === "array" ? value.items : [];
}

function addObjectKeys(node: ASTNode | undefined, into: Set<string>): void {
  const obj = asObject(node);
  if (!obj) {
    return;
  }
  for (const property of obj.properties) {
    const key = property.keyNode.value;
    if (key.length > 0) {
      into.add(key);
    }
  }
}

export { getTemplateCompletions };
