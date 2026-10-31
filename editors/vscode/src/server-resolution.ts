import { join } from 'node:path';

// invariant: the server is always launched as `node <module> --stdio`, so a bundled .cjs and a
// configured entry run without an executable bit.

type ResolvedServer = {
    readonly module: string;
};

type ResolveServerInput = {
    readonly configuredPath: string | undefined;
    readonly workspaceRoot: string | undefined;
    readonly bundledModule: string;
    readonly exists: (path: string) => boolean;
};

function normalizeConfigured(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

// invariant: always answers. The bundled server is the fallback, so the extension never fails to
// find one to launch.
function resolveServer(input: ResolveServerInput): ResolvedServer {
    const configured = normalizeConfigured(input.configuredPath);
    if (configured !== undefined) {
        return { module: configured };
    }

    if (input.workspaceRoot !== undefined) {
        // hazard: the package's bundle, never node_modules/.bin/hoverfly-lsp, which is a symlink to
        // the ESM launcher on POSIX and a .cmd shim on Windows, neither of which forks as a module.
        const workspaceBundle = join(
            input.workspaceRoot,
            'node_modules',
            '@jterrazz',
            'hoverfly-lsp',
            'dist',
            'cli.cjs',
        );
        if (input.exists(workspaceBundle)) {
            return { module: workspaceBundle };
        }
    }

    return { module: input.bundledModule };
}

export { resolveServer };
