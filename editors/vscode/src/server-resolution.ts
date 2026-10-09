// invariant: the server is always launched as `node <module> --stdio`, so a bundled .cjs, an npm
// bin shim and a launcher all run without an executable bit.

type ResolvedServer = {
    readonly module: string;
    readonly source: 'bundled' | 'configuredPath' | 'workspaceBin';
};

type ResolveServerInput = {
    readonly configuredPath: string | undefined;
    readonly workspaceRoot: string | undefined;
    readonly bundledModule: string;
    readonly exists: (path: string) => boolean;
    readonly join?: (...segments: string[]) => string;
};

const defaultJoin = (...segments: string[]): string =>
    segments.join('/').replaceAll(/\/{2,}/gu, '/');

function normalizeConfigured(value: string | undefined): string | undefined {
    if (typeof value !== 'string') {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

// invariant: always answers — the bundled server is the fallback, so the extension never fails to
// find one to launch.
function resolveServer(input: ResolveServerInput): ResolvedServer {
    const join = input.join ?? defaultJoin;

    const configured = normalizeConfigured(input.configuredPath);
    if (configured !== undefined) {
        return { module: configured, source: 'configuredPath' };
    }

    if (input.workspaceRoot !== undefined) {
        const workspaceBin = join(input.workspaceRoot, 'node_modules', '.bin', 'hoverfly-lsp');
        if (input.exists(workspaceBin)) {
            return { module: workspaceBin, source: 'workspaceBin' };
        }
    }

    return { module: input.bundledModule, source: 'bundled' };
}

export { resolveServer };
