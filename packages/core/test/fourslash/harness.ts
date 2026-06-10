/**
 * Fourslash-style cursor-marker test harness for the Hoverfly language service.
 *
 * Inspired by typescript-go's `fourslash` and the classic VS Code `/*$0*\/` marker tests, but
 * adapted to JSON: the marker token must be insertable *inside a JSON string literal* without
 * breaking the JSON (so we can place a cursor at `"matcher": "⟦⟧"`). We therefore use the
 * Unicode bracket pair **`⟦name⟧`** (U+27E6 / U+27E7):
 *
 *   - it is an ordinary character inside a JSON string (no escaping needed), so the surrounding
 *     document stays valid JSON once the marker text is stripped;
 *   - it never appears in real Hoverfly content, so there are no false positives;
 *   - it reads clearly in a test fixture: `"⟦cursor⟧"`, `"matcher": ⟦bare⟧`.
 *
 * A bare `⟦⟧` (empty name) is the default/anonymous marker; `⟦name⟧` declares a named marker so a
 * single document can carry several cursor positions. The marker text is removed from the
 * document and its offset recorded as the cursor Position.
 */

import { expect } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import type { CompletionItem, Hover, MarkupContent, Position } from "vscode-languageserver-types";

import type { HoverflyServiceSettings } from "../../src/semantic/types.js";
import { createHoverflyLanguageService } from "../../src/service.js";

/* ------------------------------------- marker scanning ----------------------------------- */

/** The opening / closing marker brackets (Unicode mathematical white square brackets). */
const MARKER_OPEN = "⟦";
const MARKER_CLOSE = "⟧";
const MARKER_RE = /⟦(?<name>[^⟧]*)⟧/g;

/** A parsed marked document: the stripped text plus the cursor positions by marker name. */
interface MarkedDocument {
  /** The document text with all markers removed. */
  readonly text: string;
  /** Cursor positions keyed by marker name (`""` is the default/anonymous marker). */
  readonly positions: ReadonlyMap<string, Position>;
}

/* ------------------------------------- request set-up ------------------------------------ */

/** Options for the assertion helpers: filename gate + service settings. */
interface ServiceOptions {
  /** Document URI (controls the D3 filename gate). Defaults to a `*.hoverfly.json` URI. */
  readonly uri?: string;
  /** Service-level settings (e.g. `registeredActions`). */
  readonly settings?: HoverflyServiceSettings;
}

interface PreparedRequest {
  readonly service: ReturnType<typeof createHoverflyLanguageService>;
  readonly document: TextDocument;
  readonly position: Position;
}

/** Completion-label expectations. `exact` (when given) asserts the full sorted label set. */
interface CompletionExpectations {
  /** Labels that MUST be present. */
  readonly contains?: readonly string[];
  /** Labels that MUST NOT be present. */
  readonly notContains?: readonly string[];
  /** When given, the complete sorted set of labels must equal this (sorted). */
  readonly exact?: readonly string[];
}

function scan(source: string): MarkedDocument {
  // Cheap balance check: a stray close bracket with no open would slip past the regex.
  const opens = (source.match(/⟦/g) ?? []).length;
  const closes = (source.match(/⟧/g) ?? []).length;
  if (opens !== closes) {
    throw new Error(
      `Unbalanced cursor markers: ${opens} '${MARKER_OPEN}' vs ${closes} '${MARKER_CLOSE}'`,
    );
  }

  const positions = new Map<string, { offset: number }>();
  let stripped = "";
  let lastIndex = 0;
  let removed = 0;
  for (const match of source.matchAll(MARKER_RE)) {
    const name = match.groups?.name ?? "";
    const matchStart = match.index;
    stripped += source.slice(lastIndex, matchStart);
    const offset = matchStart - removed;
    if (positions.has(name)) {
      throw new Error(`Duplicate cursor marker '${name || "(default)"}'`);
    }
    positions.set(name, { offset });
    removed += match[0].length;
    lastIndex = matchStart + match[0].length;
  }
  stripped += source.slice(lastIndex);

  // Convert offsets to Positions via a TextDocument over the stripped text.
  const document = TextDocument.create("file:///marker.json", "json", 1, stripped);
  const resolved = new Map<string, Position>();
  for (const [name, { offset }] of positions) {
    resolved.set(name, document.positionAt(offset));
  }
  return { text: stripped, positions: resolved };
}

function prepare(
  doc: MarkedDocument | string,
  marker: string,
  options: ServiceOptions,
): PreparedRequest {
  const parsed = typeof doc === "string" ? scan(doc) : doc;
  const position = parsed.positions.get(marker);
  if (!position) {
    throw new Error(`No cursor marker '${marker || "(default)"}' in document`);
  }
  const uri = options.uri ?? "file:///sim.hoverfly.json";
  const document = TextDocument.create(uri, "json", 1, parsed.text);
  const service = createHoverflyLanguageService([], options.settings ?? {});
  return { service, document, position };
}

/** Flatten a Hover's contents (string | MarkupContent | MarkedString[]) to a single string. */
function renderHover(hover: Hover | null): string {
  if (!hover) {
    return "";
  }
  const { contents } = hover;
  if (typeof contents === "string") {
    return contents;
  }
  if (Array.isArray(contents)) {
    return contents.map((c) => (typeof c === "string" ? c : c.value)).join("\n");
  }
  return (contents as MarkupContent).value;
}

/* ----------------------------------------- public API ------------------------------------ */

/**
 * Strip `⟦name⟧` markers from `source`, returning the clean text and each marker's cursor
 * {@link Position}. Multiple named markers are supported; an empty name (`⟦⟧`) is the default.
 *
 * @throws if the same marker name appears twice (ambiguous), or if brackets are unbalanced.
 */
function parseMarkedDocument(source: string): MarkedDocument {
  return scan(source);
}

/** Run completion at `marker` and assert the label expectations. Returns the items for extra checks. */
async function expectCompletions(
  doc: MarkedDocument | string,
  marker: string,
  expectations: CompletionExpectations,
  options: ServiceOptions = {},
): Promise<CompletionItem[]> {
  const { service, document, position } = prepare(doc, marker, options);
  const list = await service.doComplete(document, position);
  const items = list?.items ?? [];
  const labels = items.map((i) => i.label);
  if (expectations.contains) {
    for (const label of expectations.contains) {
      expect(labels, `expected completion '${label}' at marker '${marker}'`).toContain(label);
    }
  }
  if (expectations.notContains) {
    for (const label of expectations.notContains) {
      expect(labels, `did NOT expect completion '${label}' at marker '${marker}'`).not.toContain(
        label,
      );
    }
  }
  if (expectations.exact) {
    expect([...labels].sort()).toEqual([...expectations.exact].sort());
  }
  return items;
}

/** Run completion at `marker` and assert NO completions are produced. */
async function expectNoCompletions(
  doc: MarkedDocument | string,
  marker: string,
  options: ServiceOptions = {},
): Promise<void> {
  const { service, document, position } = prepare(doc, marker, options);
  const list = await service.doComplete(document, position);
  expect(list?.items ?? []).toHaveLength(0);
}

/** Run hover at `marker` and assert the rendered content includes each `includes` substring. */
async function expectHover(
  doc: MarkedDocument | string,
  marker: string,
  expectations: { readonly includes: readonly string[] },
  options: ServiceOptions = {},
): Promise<Hover | null> {
  const { service, document, position } = prepare(doc, marker, options);
  const hover = await service.doHover(document, position);
  const rendered = renderHover(hover);
  for (const fragment of expectations.includes) {
    expect(rendered, `hover at '${marker}' should include '${fragment}'`).toContain(fragment);
  }
  return hover;
}

/** Run hover at `marker` and return the rendered text (for negative / custom assertions). */
async function getHoverText(
  doc: MarkedDocument | string,
  marker: string,
  options: ServiceOptions = {},
): Promise<string> {
  const { service, document, position } = prepare(doc, marker, options);
  return renderHover(await service.doHover(document, position));
}

export {
  type CompletionExpectations,
  expectCompletions,
  expectHover,
  expectNoCompletions,
  getHoverText,
  type MarkedDocument,
  parseMarkedDocument,
  type ServiceOptions,
};
