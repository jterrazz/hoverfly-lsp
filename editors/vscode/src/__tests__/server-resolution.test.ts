import { describe, expect, test } from 'vitest';

import { resolveServer } from '../server-resolution.js';

const BUNDLED = '/ext/server/bin/hoverfly-lsp.js';
const NEVER = (): boolean => false;
const ALWAYS = (): boolean => true;

describe('resolveServer', () => {
    test('precedence — prefers the configured hoverfly.server.path above everything else', () => {
        // Given - an explicit setting AND a workspace bin that exists
        const result = resolveServer({
            configuredPath: '/usr/local/bin/hoverfly-lsp',
            workspaceRoot: '/work',
            bundledModule: BUNDLED,
            exists: ALWAYS,
        });

        // Then - the configured path wins unconditionally
        expect(result).toStrictEqual({
            module: '/usr/local/bin/hoverfly-lsp',
            source: 'configuredPath',
        });
    });

    test('precedence — falls back to the workspace node_modules/.bin install when no setting is given', () => {
        // Given - no setting, a workspace root, and the workspace bin exists on disk
        const result = resolveServer({
            configuredPath: undefined,
            workspaceRoot: '/work',
            bundledModule: BUNDLED,
            exists: (p) => p === '/work/node_modules/.bin/hoverfly-lsp',
        });

        // Then - the project-local server is chosen
        expect(result).toStrictEqual({
            module: '/work/node_modules/.bin/hoverfly-lsp',
            source: 'workspaceBin',
        });
    });

    test('precedence — falls back to the bundled server when there is no setting and no workspace install', () => {
        // Given - no setting and a workspace whose .bin does not exist
        const result = resolveServer({
            configuredPath: undefined,
            workspaceRoot: '/work',
            bundledModule: BUNDLED,
            exists: NEVER,
        });

        // Then - the bundled server (guaranteed to ship) is used
        expect(result).toStrictEqual({ module: BUNDLED, source: 'bundled' });
    });

    test('precedence — falls back to the bundled server when no workspace folder is open', () => {
        // Given - no setting and no workspace root (single-file window)
        const result = resolveServer({
            configuredPath: undefined,
            workspaceRoot: undefined,
            bundledModule: BUNDLED,
            exists: ALWAYS,
        });

        // Then - bundled is used and exists() is never the deciding factor
        expect(result).toStrictEqual({ module: BUNDLED, source: 'bundled' });
    });

    test('configured path normalization — treats a whitespace-only setting as unset', () => {
        // Given - a setting that is only spaces
        const result = resolveServer({
            configuredPath: '   ',
            workspaceRoot: undefined,
            bundledModule: BUNDLED,
            exists: NEVER,
        });

        // Then - it is ignored and the bundled server is used
        expect(result.source).toBe('bundled');
    });

    test('configured path normalization — trims surrounding whitespace from a real configured path', () => {
        // Given - a configured path with stray whitespace
        const result = resolveServer({
            configuredPath: '  /opt/hoverfly-lsp  ',
            workspaceRoot: undefined,
            bundledModule: BUNDLED,
            exists: NEVER,
        });

        // Then - the trimmed path is returned
        expect(result).toStrictEqual({ module: '/opt/hoverfly-lsp', source: 'configuredPath' });
    });
});
