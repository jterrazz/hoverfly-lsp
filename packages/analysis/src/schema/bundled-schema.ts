import type { JSONSchema } from 'vscode-json-languageservice';

import schema from './hoverfly.schema.json' with { type: 'json' };

/** The enhanced Hoverfly schema the language service validates against, resolved offline. */
export const hoverflySchema: JSONSchema = schema;
