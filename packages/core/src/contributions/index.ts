/**
 * Public surface of the JSON-level IntelliSense subsystem (completions + hover layered on the
 * schema engine via the stock {@link JSONWorkerContribution} hook). The service composes
 * {@link createHoverflyContribution} into `getLanguageService({ contributions })`.
 *
 * Only the factory is re-exported here: the path recognisers and docs renderers in this
 * directory are internal building blocks consumed by `hoverfly-contribution.ts` (and exercised
 * directly by the unit tests via their own modules).
 */

export { createHoverflyContribution } from "./hoverfly-contribution.js";
