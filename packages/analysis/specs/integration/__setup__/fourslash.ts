import { TextDocument } from 'vscode-languageserver-textdocument';
import type { CompletionItem, Hover, Position } from 'vscode-languageserver-types';
import { CompletionItemKind } from 'vscode-languageserver-types';

import type { HoverflyServiceSettings } from '../../../src/semantic/rule.js';
import { createHoverflyLanguageService } from '../../../src/service.js';

// value: U+27E6 and U+27E7 are ordinary characters inside a JSON string and never occur in Hoverfly
// content, so a document stays valid JSON once its markers are stripped.
const MARKER = /⟦(?<name>[^⟧]*)⟧/gu;

/** A document with its cursor markers stripped: the clean text, and each marker's offset by name. */
export type MarkedDocument = {
    readonly offsets: ReadonlyMap<string, number>;
    readonly text: string;
};

/** What the language service is opened with: the document's URI and the editor's settings. */
export type ServiceOptions = {
    readonly settings?: HoverflyServiceSettings;
    readonly uri?: string;
};

/** One entry of a completion list as an editor shows it: its label and the kind its icon draws. */
export type CompletionEntry = { readonly kind: string; readonly label: string };

const KIND_NAMES: ReadonlyMap<unknown, string> = new Map(
    Object.entries(CompletionItemKind)
        .filter(([, value]) => typeof value === 'number')
        .map(([name, value]) => [value, name]),
);

/** Strips the `⟦name⟧` markers of a source; `⟦⟧` is the marker named `''`. */
export function parseMarkedDocument(source: string): MarkedDocument {
    const opened = source.split('⟦').length;
    if (opened !== source.split('⟧').length) {
        throw new Error(`Unbalanced cursor markers in ${source}`);
    }
    const offsets = new Map<string, number>();
    let text = '';
    let consumed = 0;
    for (const match of source.matchAll(MARKER)) {
        const name = match.groups?.name ?? '';
        if (offsets.has(name)) {
            throw new Error(`Duplicate cursor marker '${name}' in ${source}`);
        }
        text += source.slice(consumed, match.index);
        offsets.set(name, text.length);
        consumed = match.index + match[0].length;
    }
    return { offsets, text: text + source.slice(consumed) };
}

function openedAt(
    marked: MarkedDocument,
    marker: string,
    options: ServiceOptions,
): {
    document: TextDocument;
    position: Position;
    service: ReturnType<typeof createHoverflyLanguageService>;
} {
    const offset = marked.offsets.get(marker);
    if (offset === undefined) {
        throw new Error(`No cursor marker '${marker}' in ${marked.text}`);
    }
    const document = TextDocument.create(
        options.uri ?? 'file:///sim.hoverfly.json',
        'json',
        1,
        marked.text,
    );
    return {
        document,
        position: document.positionAt(offset),
        service: createHoverflyLanguageService([], options.settings ?? {}),
    };
}

/** The completion items the service answers at `marker`. */
export async function completionsAt(
    source: MarkedDocument | string,
    marker = '',
    options: ServiceOptions = {},
): Promise<CompletionItem[]> {
    const marked = typeof source === 'string' ? parseMarkedDocument(source) : source;
    const { document, position, service } = openedAt(marked, marker, options);
    const list = await service.doComplete(document, position);
    return list?.items ?? [];
}

/** The completion list at `marker` as an editor shows it, in the service's order. */
export async function entriesAt(
    source: MarkedDocument | string,
    marker = '',
    options: ServiceOptions = {},
): Promise<CompletionEntry[]> {
    const items = await completionsAt(source, marker, options);
    return items.map((item) => ({
        kind: item.kind === undefined ? '(none)' : (KIND_NAMES.get(item.kind) ?? String(item.kind)),
        label: item.label,
    }));
}

/** Each completion at `marker` as its label and the text it inserts, in the service's order. */
export async function insertionsAt(
    source: MarkedDocument | string,
    marker = '',
    options: ServiceOptions = {},
): Promise<{ insertText: string | undefined; label: string }[]> {
    const items = await completionsAt(source, marker, options);
    return items.map(({ insertText, label }) => ({ insertText, label }));
}

/** The labels of the completion list at `marker`, in the service's order. */
export async function labelsAt(
    source: MarkedDocument | string,
    marker = '',
    options: ServiceOptions = {},
): Promise<string[]> {
    const items = await completionsAt(source, marker, options);
    return items.map((item) => item.label);
}

function rendered(hover: Hover | null): string {
    if (hover === null) {
        return '';
    }
    const { contents } = hover;
    if (typeof contents === 'string') {
        return contents;
    }
    if (Array.isArray(contents)) {
        return contents.map((part) => (typeof part === 'string' ? part : part.value)).join('\n');
    }
    return contents.value;
}

/** The hover the service answers at `marker`, as the Markdown an editor renders, empty when none. */
export async function hoverAt(
    source: MarkedDocument | string,
    marker = '',
    options: ServiceOptions = {},
): Promise<string> {
    const marked = typeof source === 'string' ? parseMarkedDocument(source) : source;
    const { document, position, service } = openedAt(marked, marker, options);
    return rendered(await service.doHover(document, position));
}
