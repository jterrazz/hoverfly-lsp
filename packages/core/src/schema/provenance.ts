/**
 * Provenance for the bundled Hoverfly schema.
 *
 * The bundled `hoverfly.schema.json` is an enhanced — but faithful — superset of Hoverfly's
 * official `core/handlers/v2/schema.json`. These constants pin the exact upstream source it
 * was derived from, so a CI drift job can diff our bundle against the same commit and flag
 * when Hoverfly's schema moves.
 */

/** The Hoverfly `master` commit the bundled schema was cross-checked against. */
export const HOVERFLY_COMMIT = "aeff9058b3251bc1896c453c4e99f88cac06a284";

/** Raw URL of the upstream schema the bundle mirrors. */
export const HOVERFLY_SCHEMA_URL =
  "https://raw.githubusercontent.com/SpectoLabs/hoverfly/master/core/handlers/v2/schema.json";

/** ISO date the upstream schema was fetched and cross-checked. */
export const SCHEMA_FETCHED_AT = "2026-06-11";
