// invariant: the families' order is a tie-break only; the engine re-sorts the diagnostics by
// range.

import type { SemanticRule } from '../rule.js';
import { HF1XX_RULES } from './hf1xx.js';
import { HF2XX_VALUE_RULES } from './hf2xx-values.js';
import { HF2XX_RULES } from './hf2xx.js';
import { HF3XX_RULES } from './hf3xx.js';
import { HF4XX_RULES } from './hf4xx.js';
import { HF5XX_VARIABLES_RULES } from './hf5xx-variables.js';
import { HF5XX_RULES } from './hf5xx.js';
import { HF6XX_RULES } from './hf6xx.js';
import { MATCHER_SYNTAX_RULES } from './matcher-syntax.js';
import { STRUCTURE_RULES } from './structure.js';

export const ALL_RULES: readonly SemanticRule[] = [
    ...HF1XX_RULES,
    ...HF2XX_RULES,
    ...HF2XX_VALUE_RULES,
    ...MATCHER_SYNTAX_RULES,
    ...HF3XX_RULES,
    ...HF4XX_RULES,
    ...HF5XX_RULES,
    ...HF5XX_VARIABLES_RULES,
    ...HF6XX_RULES,
    ...STRUCTURE_RULES,
];
