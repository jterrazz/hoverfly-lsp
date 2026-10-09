import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

import { HOVERFLY_COMMIT } from '../../packages/analysis/src/schema/provenance.js';

const SHA_256 = expect.stringMatching(/^[0-9a-f]{64}$/u);

describe('upstream baseline', () => {
    test('hashes, at the pinned commit, every Go source the registries were transcribed from', () => {
        // Given - the manifest the drift workflow re-hashes upstream against
        const manifest: unknown = JSON.parse(
            readFileSync(
                new URL('../../schemas/upstream-source-hashes.json', import.meta.url),
                'utf8',
            ),
        );

        // Then - pinned where provenance.ts pins the bundled schema, one SHA-256 per cited file
        expect(manifest).toStrictEqual({
            _comment: expect.any(String),
            algorithm: 'sha256',
            commit: HOVERFLY_COMMIT,
            files: {
                'core/handlers/v2/schema.json': SHA_256,
                'core/matching/body_formdata_matching.go': SHA_256,
                'core/matching/field_matcher.go': SHA_256,
                'core/matching/matchers/matcher_value_generator.go': SHA_256,
                'core/matching/matchers/matchers.go': SHA_256,
                'core/models/request_matcher.go': SHA_256,
                'core/templating/parse_duration.go': SHA_256,
                'core/templating/template_helpers.go': SHA_256,
                'core/templating/templating.go': SHA_256,
                'core/util/jwt.go': SHA_256,
                'core/util/util.go': SHA_256,
            },
        });
    });
});
