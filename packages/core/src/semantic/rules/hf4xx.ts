/**
 * HF4xx — state-flow rules. All three consume one state-flow index built once per document
 * from the {@link SimulationModel}, never re-walking the AST.
 *
 *   HF401 (W)  a `requiresState` key is never set by ANY `transitionsState` in the file —
 *              the pair can only match if the state is set externally.
 *   HF402 (I)  a `transitionsState` key is never required anywhere in the simulation.
 *   HF403 (I)  a `removesState` entry is never set by any `transitionsState`.
 *
 * Cross-pair is the point: a key required in pair A and set in pair B raises nothing. The
 * index is therefore document-global (union of all pairs), not per-pair.
 *
 * `sequence:`-prefixed keys are Hoverfly's built-in sequencing mechanism (they are auto-set
 * and auto-incremented by Hoverfly itself), so they are exempt from HF401/HF402. HF403 also
 * skips them: a `sequence:` key is never "set" by a transitionsState, yet removing it is not a
 * user mistake we should flag.
 */

import { type Diagnostic } from "vscode-languageserver-types";

import { makeDiagnostic } from "../diagnostics.js";
import type {
  RemovesStateEntry,
  RuleContext,
  SemanticRule,
  SimulationModel,
  StateEntry,
} from "../types.js";

/** Prefix marking Hoverfly's built-in sequencing keys, which are auto-managed. */
const SEQUENCE_PREFIX = "sequence:";

function isSequenceKey(key: string): boolean {
  return key.startsWith(SEQUENCE_PREFIX);
}

/* ----------------------------------------------------------------------------------------- *
 * State flow is read straight off the typed model: `pair.requiresState` (request-level),
 * `pair.transitionsState` / `pair.removesState` (response-level). The model places these on
 * the correct child nodes per Hoverfly source truth (research/02), so no AST re-walking here.
 * ----------------------------------------------------------------------------------------- */

/** A state-flow occurrence tagged with the index of the pair it was found in. */
interface PairScopedEntry<T> {
  readonly pairIndex: number;
  readonly entry: T;
}

/**
 * A document-global view of state flow: the set of keys that appear on each side, plus every
 * AST-anchored occurrence (tagged with its pair index) so a rule can point a diagnostic at
 * each offending node and reason about same-pair vs cross-pair satisfaction.
 */
interface StateFlowIndex {
  /** Keys named by any `requiresState` across all pairs. */
  readonly requiredKeys: ReadonlySet<string>;
  /** Keys named by any `transitionsState` across all pairs (the only way a state is "set"). */
  readonly setKeys: ReadonlySet<string>;
  /** For each set key, the indices of pairs whose `transitionsState` set it. */
  readonly setByPairIndices: ReadonlyMap<string, ReadonlySet<number>>;
  /** Every `requiresState` entry, with its pair index, across all pairs. */
  readonly requires: readonly PairScopedEntry<StateEntry>[];
  /** Every `transitionsState` entry, with its key node, across all pairs. */
  readonly transitions: readonly StateEntry[];
  /** Every `removesState` entry, with its string node, across all pairs. */
  readonly removes: readonly RemovesStateEntry[];
}

/** Build the document-global state-flow index from the model (one pass over all pairs). */
function buildStateFlowIndex(model: SimulationModel): StateFlowIndex {
  const requires: PairScopedEntry<StateEntry>[] = [];
  const transitions: StateEntry[] = [];
  const removes: RemovesStateEntry[] = [];
  const setByPairIndices = new Map<string, Set<number>>();

  model.pairs.forEach((pair, pairIndex) => {
    for (const entry of pair.requiresState) {
      requires.push({ pairIndex, entry });
    }
    for (const entry of pair.transitionsState) {
      transitions.push(entry);
      const indices = setByPairIndices.get(entry.key) ?? new Set<number>();
      indices.add(pairIndex);
      setByPairIndices.set(entry.key, indices);
    }
    removes.push(...pair.removesState);
  });

  return {
    requiredKeys: new Set(requires.map((scoped) => scoped.entry.key)),
    setKeys: new Set(transitions.map((entry) => entry.key)),
    setByPairIndices,
    requires,
    transitions,
    removes,
  };
}

/**
 * HF401: a required state key is never set by any transitionsState (and is not a `sequence:`
 * key). Warns once per offending `requiresState` occurrence, pointed at the key node.
 *
 * Satisfaction is cross-pair only: a required key is silenced when SOME OTHER pair's
 * transitionsState sets it. A key required and transitioned in the SAME (and only that) pair
 * still warns — the response that sets the state fires AFTER the match, so on first encounter
 * the state is still unset. The message already hedges ("set externally").
 */
export const hf401RequiresNeverSet: SemanticRule = {
  codes: ["HF401"],
  run(context: RuleContext): Diagnostic[] {
    const index = buildStateFlowIndex(context.model);
    const diagnostics: Diagnostic[] = [];

    for (const { pairIndex, entry } of index.requires) {
      if (isSequenceKey(entry.key) || !entry.keyNode) {
        continue;
      }
      // Satisfied only by a DIFFERENT pair (a same-pair transitionsState fires after the match).
      const setBy = index.setByPairIndices.get(entry.key);
      const satisfiedByOtherPair = setBy
        ? [...setBy].some((otherIndex) => otherIndex !== pairIndex)
        : false;
      if (!satisfiedByOtherPair) {
        diagnostics.push(
          makeDiagnostic(context.textDocument, "HF401", entry.keyNode, { key: entry.key }),
        );
      }
    }

    return diagnostics;
  },
};

/**
 * HF402: a transitioned state key is never required anywhere (and is not a `sequence:` key).
 * Information-level, one per offending `transitionsState` occurrence, on the key node.
 */
export const hf402TransitionsNeverRequired: SemanticRule = {
  codes: ["HF402"],
  run(context: RuleContext): Diagnostic[] {
    const index = buildStateFlowIndex(context.model);
    const diagnostics: Diagnostic[] = [];

    for (const entry of index.transitions) {
      if (isSequenceKey(entry.key) || !entry.keyNode) {
        continue;
      }
      if (!index.requiredKeys.has(entry.key)) {
        diagnostics.push(
          makeDiagnostic(context.textDocument, "HF402", entry.keyNode, { key: entry.key }),
        );
      }
    }

    return diagnostics;
  },
};

/**
 * HF403: a `removesState` entry names a key that is never set by any transitionsState.
 * Information-level, one per offending entry, on the entry's string node. `sequence:` keys are
 * exempt (they are auto-managed, never set by a transitionsState).
 */
export const hf403RemovesNeverSet: SemanticRule = {
  codes: ["HF403"],
  run(context: RuleContext): Diagnostic[] {
    const index = buildStateFlowIndex(context.model);
    const diagnostics: Diagnostic[] = [];

    for (const entry of index.removes) {
      if (isSequenceKey(entry.key) || !entry.node) {
        continue;
      }
      if (!index.setKeys.has(entry.key)) {
        diagnostics.push(
          makeDiagnostic(context.textDocument, "HF403", entry.node, { key: entry.key }),
        );
      }
    }

    return diagnostics;
  },
};

/** All HF4xx state-flow rules. The integrator spreads this into `ALL_RULES`. */
export const HF4XX_RULES: readonly SemanticRule[] = [
  hf401RequiresNeverSet,
  hf402TransitionsNeverRequired,
  hf403RemovesNeverSet,
];
