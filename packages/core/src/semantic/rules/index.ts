/**
 * Registry of all semantic rule families. The engine runs every rule in {@link ALL_RULES}.
 *
 * To add a rule family: create `rules/hfNxx.ts` exporting a `HFNXX_RULES: SemanticRule[]`
 * array, import it here, and spread it into {@link ALL_RULES}. Keep families ordered by code
 * — final diagnostics are re-sorted by range, so this order is only a tie-break aid.
 */

import type { SemanticRule } from "../types.js";
import { HF1XX_RULES } from "./hf1xx.js";
import { HF2XX_RULES } from "./hf2xx.js";
import { HF3XX_RULES } from "./hf3xx.js";
import { HF4XX_RULES } from "./hf4xx.js";
import { HF5XX_VARIABLES_RULES } from "./hf5xx-variables.js";
import { HF5XX_RULES } from "./hf5xx.js";
import { HF6XX_RULES } from "./hf6xx.js";
import { MATCHER_SYNTAX_RULES } from "./matcher-syntax.js";
import { STRUCTURE_RULES } from "./structure.js";

export const ALL_RULES: readonly SemanticRule[] = [
  ...HF1XX_RULES,
  ...HF2XX_RULES,
  ...MATCHER_SYNTAX_RULES,
  ...HF3XX_RULES,
  ...HF4XX_RULES,
  ...HF5XX_RULES,
  ...HF5XX_VARIABLES_RULES,
  ...HF6XX_RULES,
  ...STRUCTURE_RULES,
];
