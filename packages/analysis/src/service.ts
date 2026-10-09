import { getLanguageService } from 'vscode-json-languageservice';
import type {
    CompletionList,
    Diagnostic,
    Hover,
    JSONDocument,
    JSONWorkerContribution,
    LanguageService,
    Position,
} from 'vscode-json-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { createHoverflyContribution } from './contributions/hoverfly-contribution.js';
import { getTemplateCompletions } from './contributions/template-completion.js';
import { getTemplateHover } from './contributions/template-hover.js';
import {
    hasHoverflyFilename,
    isHoverflySimulation,
    isHoverflySimulationAst,
} from './fingerprint.js';
import { hoverflySchema } from './schema/bundled-schema.js';
import { applyHF102Layer, createRuleContext, runRules, sortByRange } from './semantic/engine.js';
import type { HoverflyServiceSettings } from './semantic/rule.js';
import { ALL_RULES } from './semantic/rules/families.js';
import { hf101NotASimulation } from './semantic/rules/hf1xx.js';

const SCHEMA_URI =
    hoverflySchema.$id ?? 'https://hoverfly-lsp.dev/schemas/hoverfly-simulation.json';

const SCHEMA_TEXT = JSON.stringify(hoverflySchema);

// outside: many editors save JSON behind a UTF-8 byte-order mark.
const BOM = '﻿';

// outside: the JSON parser reads a leading BOM as an unexpected token and builds no root, so a
// valid simulation would fail the D3 fingerprint; a space in its place is skipped as whitespace and
// keeps every UTF-16 offset.
function stripLeadingBom(document: TextDocument): TextDocument {
    const text = document.getText();
    if (!text.startsWith(BOM)) {
        return document;
    }
    return TextDocument.create(
        document.uri,
        document.languageId,
        document.version,
        ` ${text.slice(BOM.length)}`,
    );
}

/** The language service: vscode-json-languageservice on the bundled Hoverfly schema, with the Hoverfly contribution and rules. */
export type HoverflyLanguageService = {
    /** Parse a document into an error-recovering JSON AST (reused across the other calls). */
    parse: (document: TextDocument) => JSONDocument;
    /** Whether this document looks like a Hoverfly simulation (D3 fingerprint). */
    isSimulation: (document: TextDocument) => boolean;
    /** Diagnostics of a document: the D3 gate, the schema's as HF102 and the HFxxx rules', sorted by range. */
    doValidation: (document: TextDocument, jsonDocument?: JSONDocument) => Promise<Diagnostic[]>;
    /** Schema-driven completion at a position. */
    doComplete: (
        document: TextDocument,
        position: Position,
        jsonDocument?: JSONDocument,
    ) => Promise<CompletionList | null>;
    /** Schema-driven hover at a position. */
    doHover: (
        document: TextDocument,
        position: Position,
        jsonDocument?: JSONDocument,
    ) => Promise<Hover | null>;
};

/** Creates the Hoverfly language service; the bundled schema is resolved offline, never from the network or the disk. */
export function createHoverflyLanguageService(
    contributions: JSONWorkerContribution[] = [],
    settings: HoverflyServiceSettings = {},
): HoverflyLanguageService {
    // outside: the contribution API hands a URI and a JSON path, never the text, so the documents
    // the last completion, hover or parse saw are kept for the contribution to resolve.
    const seenDocuments = new Map<string, TextDocument>();
    const hoverflyContribution = createHoverflyContribution(settings, (uri) =>
        seenDocuments.get(uri),
    );

    const service: LanguageService = getLanguageService({
        contributions: [hoverflyContribution, ...contributions],
        schemaRequestService: async (uri: string): Promise<string> => {
            if (uri === SCHEMA_URI) {
                return SCHEMA_TEXT;
            }
            throw new Error(`Unknown schema URI: ${uri}`);
        },
    });

    service.configure({
        validate: true,
        allowComments: false,
        schemas: [{ uri: SCHEMA_URI, fileMatch: ['*.json', '*.hfy'] }],
    });

    function parse(document: TextDocument): JSONDocument {
        seenDocuments.set(document.uri, document);
        return service.parseJSONDocument(document);
    }

    // invariant: a document that is no simulation answers nothing — HF101 alone when its name
    // claims Hoverfly — so a non-simulation file gets no schema or semantic noise.
    async function validate(
        document: TextDocument,
        jsonDocument?: JSONDocument,
    ): Promise<Diagnostic[]> {
        const parsed = jsonDocument ?? parse(document);

        // value: the fingerprint reads the error-recovering AST, not JSON.parse, so a broken but
        // recognisable simulation still gets its diagnostics.
        if (!isHoverflySimulationAst(parsed.root)) {
            return hasHoverflyFilename(document.uri) ? [hf101NotASimulation(document)] : [];
        }

        const schemaDiagnostics = await service.doValidation(document, parsed);
        const context = createRuleContext(document, parsed, settings);
        const semanticDiagnostics = runRules(ALL_RULES, context);

        return sortByRange([
            ...applyHF102Layer(schemaDiagnostics, semanticDiagnostics),
            ...semanticDiagnostics,
        ]);
    }

    return {
        parse(document: TextDocument): JSONDocument {
            return parse(stripLeadingBom(document));
        },
        isSimulation(document: TextDocument): boolean {
            return isHoverflySimulation(stripLeadingBom(document).getText());
        },
        async doValidation(
            document: TextDocument,
            jsonDocument?: JSONDocument,
        ): Promise<Diagnostic[]> {
            return await validate(stripLeadingBom(document), jsonDocument);
        },
        async doComplete(
            document: TextDocument,
            position: Position,
            jsonDocument?: JSONDocument,
        ): Promise<CompletionList | null> {
            const normalized = stripLeadingBom(document);
            seenDocuments.set(normalized.uri, normalized);
            const parsed = jsonDocument ?? parse(normalized);

            // invariant: inside a templatable string the template completions replace the schema's
            // — the cursor is inside a JSON string value — and they are computed here, where the
            // position is known.
            const templateItems = getTemplateCompletions(normalized, parsed, position);
            if (templateItems) {
                return { isIncomplete: false, items: templateItems };
            }
            return await service.doComplete(normalized, position, parsed);
        },
        async doHover(
            document: TextDocument,
            position: Position,
            jsonDocument?: JSONDocument,
        ): Promise<Hover | null> {
            const normalized = stripLeadingBom(document);
            seenDocuments.set(normalized.uri, normalized);
            const parsed = jsonDocument ?? parse(normalized);
            const templateHover = getTemplateHover(normalized, parsed, position);
            if (templateHover) {
                return templateHover;
            }
            return await service.doHover(normalized, position, parsed);
        },
    };
}
