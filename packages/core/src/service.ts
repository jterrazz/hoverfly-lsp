import { type TextDocument } from "vscode-languageserver-textdocument";
import { type Diagnostic } from "vscode-languageserver-types";

import { isHoverflySimulation } from "./fingerprint.js";

/**
 * The facade returned by {@link createHoverflyLanguageService}.
 *
 * This is a placeholder shape for the scaffold phase. Phase 2 (core foundation) wires
 * `vscode-json-languageservice` behind these methods (schema validation, semantic
 * validators, completion, hover) per research report 03 §2.4.
 */
export interface HoverflyLanguageService {
  /**
   * Compute diagnostics for a document. Returns `[]` for documents that are not
   * Hoverfly simulations (per the D3 fingerprint) and, for now, for everything else
   * too — semantic validation lands in later phases.
   */
  diagnostics: (document: TextDocument) => Promise<Diagnostic[]>;
  /** Whether this document looks like a Hoverfly simulation (D3 fingerprint). */
  isSimulation: (document: TextDocument) => boolean;
}

/**
 * Placeholder factory. Returns a service that performs the D3 fingerprint and otherwise
 * produces no diagnostics. The real `getLanguageService(...)` wiring arrives in Phase 2.
 */
export function createHoverflyLanguageService(): HoverflyLanguageService {
  return {
    isSimulation(document: TextDocument): boolean {
      return isHoverflySimulation(document.getText());
    },
    diagnostics(_document: TextDocument): Promise<Diagnostic[]> {
      // Placeholder: real semantic validation lands in Phase 2. Always resolves to [].
      return Promise.resolve([]);
    },
  };
}
