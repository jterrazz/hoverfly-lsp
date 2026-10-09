import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

import { HOVERFLY_COMMIT } from '../../../packages/analysis/src/schema/provenance.js';

function summary(manifest: unknown): unknown {
    if (typeof manifest !== 'object' || manifest === null) {
        return manifest;
    }
    const { algorithm, commit, files } = {
        algorithm: undefined,
        commit: undefined,
        files: {},
        ...manifest,
    };
    const hashes = typeof files === 'object' && files !== null ? Object.entries(files) : [];
    return {
        algorithm,
        commit,
        files: hashes.map(([path]) => path).toSorted(),
        malformed: hashes.filter(
            ([, hash]) => typeof hash !== 'string' || !/^[0-9a-f]{64}$/u.test(hash),
        ),
    };
}

describe('upstream-baseline', () => {
    test('hashes, at the pinned commit, every Go source the registries were transcribed from', () => {
        // Given - the manifest the drift workflow re-hashes upstream against
        const manifest: unknown = JSON.parse(
            readFileSync(
                new URL('../../../schemas/upstream-source-hashes.json', import.meta.url),
                'utf8',
            ),
        );

        // Then - pinned where provenance.ts pins the bundled schema, one SHA-256 per cited file
        expect(summary(manifest)).toStrictEqual({
            algorithm: 'sha256',
            commit: HOVERFLY_COMMIT,
            files: [
                'core/handlers/v2/schema.json',
                'core/matching/body_formdata_matching.go',
                'core/matching/field_matcher.go',
                'core/matching/matchers/matcher_value_generator.go',
                'core/matching/matchers/matchers.go',
                'core/models/request_matcher.go',
                'core/templating/parse_duration.go',
                'core/templating/template_helpers.go',
                'core/templating/templating.go',
                'core/util/jwt.go',
                'core/util/util.go',
            ],
            malformed: [],
        });
    });
});
