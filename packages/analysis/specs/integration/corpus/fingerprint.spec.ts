import { glob } from 'glob';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { isHoverflySimulation } from '../../../src/fingerprint.js';
import { integration } from '../integration.specification.js';

// Repo root is five levels up from this file: specs/integration/corpus/ -> repo root.
const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));

const validFiles = await glob('testdata/valid/**/*.hoverfly.json', { cwd: repoRoot });

describe('reference corpus: testdata/valid', () => {
    test('finds at least one valid fixture', () => {
        // Given - the valid corpus directory
        // Then - it is not empty (guards against a broken glob path)
        expect(validFiles.length).toBeGreaterThan(0);
    });

    test.each(validFiles)('%s parses as JSON and passes the fingerprint', async (relPath) => {
        // Given - a committed valid fixture, read and fingerprinted through the module
        const result = await integration.call(() => {
            const text = readFileSync(join(repoRoot, relPath), 'utf8');
            JSON.parse(text);
            return { fingerprinted: isHoverflySimulation(text) };
        });

        // Then - reading it threw nothing: it is valid JSON
        await expect(result.error).toBeEmpty();
        // Then - and it is recognised as a Hoverfly simulation
        expect(result.value.value.fingerprinted).toBe(true);
    });
});
