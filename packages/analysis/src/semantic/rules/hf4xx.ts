// outside: Hoverfly sets and increments a `sequence:` key itself, so such a key is exempt from all
// three rules; a key required by one pair and set by another raises nothing, so the index is
// document-global.

import type { Diagnostic } from 'vscode-languageserver-types';

import { makeDiagnostic } from '../diagnostics.js';
import type {
    RemovesStateEntry,
    RuleContext,
    SemanticRule,
    SimulationModel,
    StateEntry,
} from '../rule.js';

const SEQUENCE_PREFIX = 'sequence:';

function isSequenceKey(key: string): boolean {
    return key.startsWith(SEQUENCE_PREFIX);
}

type PairScopedEntry<T> = {
    readonly pairIndex: number;
    readonly entry: T;
};

type StateFlowIndex = {
    readonly requiredKeys: ReadonlySet<string>;
    readonly setKeys: ReadonlySet<string>;
    readonly setByPairIndices: ReadonlyMap<string, ReadonlySet<number>>;
    readonly requires: readonly PairScopedEntry<StateEntry>[];
    readonly transitions: readonly StateEntry[];
    readonly removes: readonly RemovesStateEntry[];
};

function buildStateFlowIndex(model: SimulationModel): StateFlowIndex {
    const requires: PairScopedEntry<StateEntry>[] = [];
    const transitions: StateEntry[] = [];
    const removes: RemovesStateEntry[] = [];
    const setByPairIndices = new Map<string, Set<number>>();

    for (const [pairIndex, pair] of model.pairs.entries()) {
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
    }

    return {
        requiredKeys: new Set(requires.map((scoped) => scoped.entry.key)),
        setKeys: new Set(transitions.map((entry) => entry.key)),
        setByPairIndices,
        requires,
        transitions,
        removes,
    };
}

// invariant: a key required and set in the same pair alone still warns — the response that sets it
// fires after the match, so on first encounter the state is unset.
/** HF401: a required state key no transitionsState sets, one warning per occurrence, on its key. */
export const hf401RequiresNeverSet: SemanticRule = {
    codes: ['HF401'],
    run(context: RuleContext): Diagnostic[] {
        const index = buildStateFlowIndex(context.model);
        const diagnostics: Diagnostic[] = [];

        for (const { pairIndex, entry } of index.requires) {
            if (isSequenceKey(entry.key) || !entry.keyNode) {
                continue;
            }
            const setBy = index.setByPairIndices.get(entry.key);
            const satisfiedByOtherPair = setBy
                ? [...setBy].some((otherIndex) => otherIndex !== pairIndex)
                : false;
            if (!satisfiedByOtherPair) {
                diagnostics.push(
                    makeDiagnostic(context.textDocument, 'HF401', entry.keyNode, {
                        key: entry.key,
                    }),
                );
            }
        }

        return diagnostics;
    },
};

/** HF402: a transitioned state key nothing requires, one note per occurrence, on its key. */
export const hf402TransitionsNeverRequired: SemanticRule = {
    codes: ['HF402'],
    run(context: RuleContext): Diagnostic[] {
        const index = buildStateFlowIndex(context.model);
        const diagnostics: Diagnostic[] = [];

        for (const entry of index.transitions) {
            if (isSequenceKey(entry.key) || !entry.keyNode) {
                continue;
            }
            if (!index.requiredKeys.has(entry.key)) {
                diagnostics.push(
                    makeDiagnostic(context.textDocument, 'HF402', entry.keyNode, {
                        key: entry.key,
                    }),
                );
            }
        }

        return diagnostics;
    },
};

/** HF403: a removesState entry no transitionsState sets, one note per entry. */
export const hf403RemovesNeverSet: SemanticRule = {
    codes: ['HF403'],
    run(context: RuleContext): Diagnostic[] {
        const index = buildStateFlowIndex(context.model);
        const diagnostics: Diagnostic[] = [];

        for (const entry of index.removes) {
            if (isSequenceKey(entry.key) || !entry.node) {
                continue;
            }
            if (!index.setKeys.has(entry.key)) {
                diagnostics.push(
                    makeDiagnostic(context.textDocument, 'HF403', entry.node, { key: entry.key }),
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
