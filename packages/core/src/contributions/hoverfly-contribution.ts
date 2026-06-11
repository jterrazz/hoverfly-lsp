/**
 * The Hoverfly {@link JSONWorkerContribution} — JSON-level IntelliSense layered on top of the
 * schema engine. It supplies value/property completions and hover content keyed off the JSON
 * location path, for positions the bundled schema can't express on its own:
 *
 *   - matcher NAMES at `request.<field>[].matcher` (the 14 registry matchers everywhere, plus
 *     the body-only `form` pseudo-matcher only under `request.body`);
 *   - `meta.schemaVersion` enum values (v5.3 preferred, plus v5/v5.1/v5.2);
 *   - `request.requiresState` / `response.transitionsState` KEY completions cross-referenced
 *     across the whole simulation via the {@link SimulationModel}, plus a `sequence:` snippet;
 *   - `response.postServeAction` values from the service `registeredActions` setting;
 *   - hover docs for matcher-name strings (registry docs, value types, config, doMatch, panics).
 *
 * The stock {@link JSONWorkerContribution} interface is used directly — no wrapper abstraction —
 * because its `collectValueCompletions` / `collectPropertyCompletions` / `getInfoContribution`
 * hooks already key off the JSON location path, which is exactly the context this contribution
 * needs. `service.ts` stays thin: it just passes the contribution at service creation.
 *
 * Every matcher fact comes from the registry; nothing about a matcher is hardcoded here.
 */

import {
  type CompletionsCollector,
  getLanguageService,
  type JSONPath,
  type JSONWorkerContribution,
  type MarkedString,
} from "vscode-json-languageservice";
import type { TextDocument } from "vscode-languageserver-textdocument";
/*
 * Runtime enum VALUES come from vscode-languageserver-types (ESM-friendly named exports). They
 * cannot be imported from vscode-json-languageservice under Node ESM: its CJS lexer fails to
 * detect the enum names re-exported from that package's CJS entry.
 */
import {
  type CompletionItem,
  CompletionItemKind,
  InsertTextFormat,
  MarkupKind,
} from "vscode-languageserver-types";

import { MATCHER_SPECS, type MatcherSpec } from "../registry/index.js";
import { buildSimulationModel } from "../semantic/model.js";
import type { HoverflyServiceSettings, SimulationModel } from "../semantic/types.js";
import { matcherDetail, matcherMarkdown } from "./docs.js";
import {
  isPostServeActionPosition,
  isRequiresStateKeyPosition,
  isSchemaVersionPosition,
  isTransitionsStateKeyPosition,
  matchMatcherNamePosition,
} from "./paths.js";

/* ------------------------------------- static data --------------------------------------- */

/** SchemaVersion enum values; v5.3 is the current default and is preselected/sorted first. */
const SCHEMA_VERSIONS: ReadonlyArray<{ value: string; preferred: boolean }> = [
  { value: "v5.3", preferred: true },
  { value: "v5", preferred: false },
  { value: "v5.1", preferred: false },
  { value: "v5.2", preferred: false },
];

/** JSON-quote a string so the inserted text is a valid JSON value regardless of cursor quoting. */
function jsonString(value: string): string {
  return JSON.stringify(value);
}

/**
 * Build an LSP snippet tab-stop (`$n`) or placeholder (`${n:label}`). Constructed via
 * concatenation rather than a string literal so the literal `${…}` does not read as a botched
 * JS template literal (the lint rule that forbids `${}` inside plain strings).
 */
function tabStop(index: number, placeholder?: string): string {
  const open = "$".concat("{");
  return placeholder === undefined ? `$${index}` : `${open}${index}:${placeholder}}`;
}

/* --------------------------------- the contribution itself ------------------------------- */

/**
 * Build the Hoverfly completion/hover contribution. Closes over the service settings so
 * settings-gated completions (postServeAction) have their allowlist available.
 *
 * @param settings service-level settings (e.g. `registeredActions`).
 * @param resolveDocument resolves a document URI to its {@link TextDocument} so the contribution
 *   can build a {@link SimulationModel} for cross-reference completions (state keys). The
 *   service supplies this from its open-document view; tests pass a small map-backed resolver.
 */
function createHoverflyContribution(
  settings: HoverflyServiceSettings,
  resolveDocument: (uri: string) => TextDocument | undefined,
): JSONWorkerContribution {
  function model(uri: string): SimulationModel | undefined {
    const document = resolveDocument(uri);
    if (!document) {
      return undefined;
    }
    /*
     * A throwaway re-parse: the language service already parsed for this request, but the
     * contribution API hands us only a URI + path, not the AST. The model build is defensive
     * and never throws on malformed input.
     */
    return buildSimulationModelFromText(document);
  }

  return {
    getInfoContribution(uri: string, location: JSONPath): PromiseLike<MarkedString[]> {
      const matcherPosition = matchMatcherNamePosition(location, { requireMatcherKey: true });
      if (!matcherPosition) {
        /*
         * Return undefined (not a resolved promise) so the schema-driven hover still runs; a
         * resolved promise would short-circuit it. The library guards with `if (promise)`.
         */
        return undefined as unknown as PromiseLike<MarkedString[]>;
      }
      /*
       * The library does not pass the hovered string's value, so read the matcher name back from
       * the document node at this exact path to render the right matcher's docs.
       */
      const name = matcherNameAt(uri, location, resolveDocument);
      const spec = name === undefined ? undefined : specForName(name, matcherPosition.isBody);
      if (!spec) {
        return undefined as unknown as PromiseLike<MarkedString[]>;
      }
      /*
       * A bare markdown string renders as markdown (headings, bullets); a {language,value} pair
       * would render as a fenced code block, which we do not want here.
       */
      const contents: MarkedString[] = [matcherMarkdown(spec)];
      return Promise.resolve(contents);
    },

    collectPropertyCompletions(
      uri: string,
      location: JSONPath,
      _currentWord: string,
      addValue: boolean,
      _isLast: boolean,
      result: CompletionsCollector,
    ): PromiseLike<unknown> {
      if (isRequiresStateKeyPosition(location)) {
        collectStateKeyCompletions(result, model(uri), addValue, { includeSequence: true });
      } else if (isTransitionsStateKeyPosition(location)) {
        collectStateKeyCompletions(result, model(uri), addValue, { includeSequence: false });
      }
      return Promise.resolve(undefined);
    },

    collectValueCompletions(
      uri: string,
      location: JSONPath,
      propertyKey: string,
      result: CompletionsCollector,
    ): PromiseLike<unknown> {
      // Matcher-name value: location is the matcher OBJECT path and the key is "matcher".
      if (propertyKey === "matcher") {
        const position = matchMatcherNamePosition([...location, "matcher"], {
          requireMatcherKey: true,
        });
        if (position) {
          collectMatcherNameCompletions(result, position.isBody);
        }
        return Promise.resolve(undefined);
      }
      if (isSchemaVersionPosition(location, { propertyKey })) {
        collectSchemaVersionCompletions(result);
        return Promise.resolve(undefined);
      }
      if (isPostServeActionPosition(location, { propertyKey })) {
        collectPostServeActionCompletions(result, settings);
        return Promise.resolve(undefined);
      }
      return Promise.resolve(undefined);
    },

    collectDefaultCompletions(): PromiseLike<unknown> {
      return Promise.resolve(undefined);
    },
  };
}

/* ----------------------------------- completion builders --------------------------------- */

/** Add matcher-name value completions; `form` is offered only on the request `body`. */
function collectMatcherNameCompletions(result: CompletionsCollector, isBody: boolean): void {
  for (const spec of MATCHER_SPECS) {
    if (spec.name === "") {
      // The default/empty matcher is not a useful completion label; skip it.
      continue;
    }
    if (spec.bodyOnly && !isBody) {
      continue;
    }
    result.add({
      label: spec.name,
      kind: CompletionItemKind.EnumMember,
      detail: matcherDetail(spec),
      documentation: { kind: MarkupKind.Markdown, value: matcherMarkdown(spec) },
      insertText: jsonString(spec.name),
      insertTextFormat: InsertTextFormat.PlainText,
    });
  }
}

/** Add schemaVersion enum completions (v5.3 preferred). */
function collectSchemaVersionCompletions(result: CompletionsCollector): void {
  for (const [index, entry] of SCHEMA_VERSIONS.entries()) {
    const item: CompletionItem & { insertText: string } = {
      label: entry.value,
      kind: CompletionItemKind.EnumMember,
      detail: entry.preferred
        ? "Hoverfly schema version (current default)"
        : "Hoverfly schema version",
      documentation: {
        kind: MarkupKind.Markdown,
        value: entry.preferred
          ? `\`${entry.value}\` — the current default schema version.`
          : `\`${entry.value}\` — Hoverfly validates any \`v5.x\` against the same v5 schema.`,
      },
      insertText: jsonString(entry.value),
      insertTextFormat: InsertTextFormat.PlainText,
      // Preferred version sorts first and is preselected.
      sortText: entry.preferred ? "0" : `1-${index}`,
      preselect: entry.preferred,
    };
    result.add(item);
  }
}

/**
 * Add state-KEY property completions: the union of every state key declared anywhere in the
 * simulation (cross-reference), plus optionally a `sequence:` snippet. `addValue` mirrors the
 * schema completion's behaviour of appending `: "$1"` when the value is not already present
 * (true at a bare `{` position, false when the key already carries `: ""`).
 */
function collectStateKeyCompletions(
  result: CompletionsCollector,
  simulation: SimulationModel | undefined,
  addValue: boolean,
  options: { includeSequence: boolean },
): void {
  const keys = collectStateKeys(simulation);
  for (const key of keys) {
    result.add({
      label: key,
      kind: CompletionItemKind.Property,
      detail: "State key (declared in this simulation)",
      insertText: addValue ? `${jsonString(key)}: "${tabStop(1)}"` : jsonString(key),
      insertTextFormat: InsertTextFormat.Snippet,
    });
  }
  if (options.includeSequence) {
    const namePlaceholder = `sequence:${tabStop(1, "name")}`;
    result.add({
      label: "sequence:",
      kind: CompletionItemKind.Snippet,
      detail: "Sequence-state key prefix (ordered sequence responses)",
      documentation: {
        kind: MarkupKind.Markdown,
        value:
          "A `requiresState` key prefixed `sequence:` drives ordered sequence responses (Hoverfly increments the sequence as each pair is served).",
      },
      insertText: addValue ? `${jsonString(namePlaceholder)}: "${tabStop(2)}"` : namePlaceholder,
      insertTextFormat: InsertTextFormat.Snippet,
    });
  }
}

/** Add postServeAction value completions from the service `registeredActions` allowlist. */
function collectPostServeActionCompletions(
  result: CompletionsCollector,
  settings: HoverflyServiceSettings,
): void {
  for (const action of settings.registeredActions ?? []) {
    result.add({
      label: action,
      kind: CompletionItemKind.Value,
      detail: "Registered post-serve action",
      insertText: jsonString(action),
      insertTextFormat: InsertTextFormat.PlainText,
    });
  }
}

/* --------------------------------------- helpers ----------------------------------------- */

/** The matcher spec for `name`, honouring body-only `form` and case-insensitive registry lookup. */
function specForName(name: string, isBody: boolean): MatcherSpec | undefined {
  const lower = name.toLowerCase();
  for (const spec of MATCHER_SPECS) {
    if (spec.bodyOnly) {
      // `form` is case-SENSITIVE and body-only.
      if (spec.name === name && isBody) {
        return spec;
      }
      continue;
    }
    if (spec.name.toLowerCase() === lower) {
      return spec;
    }
  }
  return undefined;
}

/**
 * Every distinct state key declared anywhere in the simulation, sorted. State keys share ONE
 * namespace across the three places a pair touches state: `requiresState` (the consumer side),
 * `transitionsState` (the producer side), and `removesState` (the eraser side). A key set by a
 * `transitionsState` on one pair is exactly the key another pair will `requiresState`, so all
 * three sources must feed the cross-reference — otherwise the common "produce here, require
 * there" flow offers no completion for the requiring side (the originally-reported gap: a key
 * only ever set via `transitionsState` was invisible when typed into `requiresState`).
 */
function collectStateKeys(simulation: SimulationModel | undefined): string[] {
  if (!simulation) {
    return [];
  }
  const keys = new Set<string>();
  for (const pair of simulation.pairs) {
    for (const entry of pair.requiresState) {
      if (entry.key.length > 0) {
        keys.add(entry.key);
      }
    }
    for (const entry of pair.transitionsState) {
      if (entry.key.length > 0) {
        keys.add(entry.key);
      }
    }
    for (const entry of pair.removesState) {
      if (entry.key.length > 0) {
        keys.add(entry.key);
      }
    }
  }
  return [...keys].sort();
}

/**
 * Read the matcher NAME string at a hover location by re-parsing the document and walking to the
 * matcher object. Returns undefined if it cannot be resolved (the hover then defers to schema).
 */
function matcherNameAt(
  uri: string,
  location: JSONPath,
  resolveDocument: (uri: string) => TextDocument | undefined,
): string | undefined {
  const document = resolveDocument(uri);
  if (!document) {
    return undefined;
  }
  // Location ends with "matcher"; the value we want is at that exact path.
  return readStringAtPath(document, location);
}

/* ---- minimal AST/document helpers (kept local; the contribution owns no model wiring) ---- */

/** A throwaway parser-only service for the contribution's own model/hover resolution. */
const parserOnly = getLanguageService({});

function buildSimulationModelFromText(document: TextDocument): SimulationModel {
  return buildSimulationModel(parserOnly.parseJSONDocument(document));
}

/** Resolve the string value at an exact JSON path, or undefined. */
function readStringAtPath(document: TextDocument, path: JSONPath): string | undefined {
  const parsed = parserOnly.parseJSONDocument(document);
  let node = parsed.root;
  for (const segment of path) {
    if (!node) {
      return undefined;
    }
    if (typeof segment === "number") {
      if (node.type !== "array") {
        return undefined;
      }
      node = node.items[segment];
    } else {
      if (node.type !== "object") {
        return undefined;
      }
      node = node.properties.find((p) => p.keyNode.value === segment)?.valueNode;
    }
  }
  return node?.type === "string" ? node.value : undefined;
}

export { createHoverflyContribution };
