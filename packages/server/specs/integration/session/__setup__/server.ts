import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import {
    ConfigurationRequest,
    createProtocolConnection,
    ExitNotification,
    InitializedNotification,
    InitializeRequest,
    LogMessageNotification,
    PublishDiagnosticsNotification,
    RegistrationRequest,
    ResponseError,
    ShutdownRequest,
    StreamMessageReader,
    StreamMessageWriter,
} from 'vscode-languageserver-protocol/node';
import type {
    InitializeParams,
    InitializeResult,
    ProtocolConnection,
    PublishDiagnosticsParams,
} from 'vscode-languageserver-protocol/node';

const PACKAGE = fileURLToPath(new URL('../../../..', import.meta.url));

// hazard: mutation runs these specs from a sandbox copy of the member, deeper than the checkout, so
// the corpus is found by walking up to it, never at a fixed depth.
/** A file of the repository's `testdata/` corpus, read as text. */
export function corpusFile(path: string): string {
    let folder = PACKAGE;
    while (!existsSync(join(folder, 'testdata'))) {
        const parent = dirname(folder);
        if (parent === folder) {
            throw new Error(`no testdata/ above ${PACKAGE}`);
        }
        folder = parent;
    }
    return readFileSync(join(folder, 'testdata', path), 'utf8');
}

// outside: a stdio language server has no specification of @jterrazz/test — `packed()` lays a tarball
// only for a cli chain, whose one-shot `.exec()` cannot hold an LSP conversation — so the spec packs
// the package once per test process, from what its build left in dist/, and runs the bin a consumer gets.
const installed = (async (): Promise<string> => {
    const destination = await mkdtemp(join(tmpdir(), 'hoverfly-lsp-packed-'));
    execFileSync('npm', ['pack', '--pack-destination', destination], {
        cwd: PACKAGE,
        stdio: 'ignore',
    });
    const [tarball = ''] = await readdir(destination);
    execFileSync('tar', ['-xzf', join(destination, tarball), '-C', destination]);
    return join(destination, 'package', 'bin', 'hoverfly-lsp.js');
})();

/** The version the server's manifest declares, which `--version` prints. */
export function manifestVersion(): string {
    const manifest: unknown = JSON.parse(readFileSync(join(PACKAGE, 'package.json'), 'utf8'));
    if (
        typeof manifest !== 'object' ||
        manifest === null ||
        !('version' in manifest) ||
        typeof manifest.version !== 'string'
    ) {
        throw new Error(`no version in ${PACKAGE}package.json`);
    }
    return manifest.version;
}

/** What one run of the packed bin printed, and how it ended. */
export type Run = {
    readonly exitCode: null | number;
    readonly stderr: string;
    readonly stdout: string;
};

/** Runs the packed `hoverfly-lsp` bin with `args` until it exits. */
export async function hoverflyLsp(args: readonly string[]): Promise<Run> {
    const child = spawn(process.execPath, [await installed, ...args]);
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
        stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
    });
    const exitCode = await new Promise<null | number>((resolve) => {
        child.on('close', resolve);
    });
    return { exitCode, stderr, stdout };
}

/** How the spec's client answers what the server asks of it. */
export type Client = {
    /** The `hoverfly` section `workspace/configuration` answers; read at every request, so a spec may change it. */
    configuration?: unknown;
    /** How long the client takes to answer `workspace/configuration`, in milliseconds. */
    readonly configurationDelay?: number;
    /** The server requests the client refuses with an error. */
    readonly refuses?: readonly ('configuration' | 'registration')[];
};

type Registered = { readonly method: string; readonly registerOptions: unknown };

/** A language-server conversation with the packed bin, ended when the scope that holds it closes. */
export type Session = AsyncDisposable & {
    readonly connection: ProtocolConnection;
    /** The sections the server asked `workspace/configuration` for, one list per request. */
    readonly configurationRequests: readonly (readonly (string | undefined)[])[];
    /** The messages the server logged, as `<type> <message>`. */
    readonly logged: readonly string[];
    /** Opens a document and answers the diagnostics the server publishes for it. */
    readonly open: (uri: string, text: string) => Promise<PublishDiagnosticsParams>;
    /** Every publication the server made, in order. */
    readonly publications: readonly PublishDiagnosticsParams[];
    /** Answers the next diagnostics the server publishes for `uri`. */
    readonly published: (uri: string) => Promise<PublishDiagnosticsParams>;
    /** The capabilities the server registered dynamically, without their generated ids. */
    readonly registrations: readonly Registered[];
    /** Waits past the server's push debounce, so a publication still pending has been made. */
    readonly settled: () => Promise<void>;
};

// value: the server debounces a push by 200 ms; twice that leaves it room to validate and send.
const SETTLE_MS = 400;

function refused(method: string): ResponseError {
    return new ResponseError(-32_603, `the spec's client refuses ${method}`);
}

type Records = Pick<
    Session,
    'configurationRequests' | 'logged' | 'publications' | 'published' | 'registrations'
>;

// invariant: a connection holds one handler per method, so the client answers and records every
// server request and notification here, and hands each publication to the first spec waiting for its uri.
function answering(connection: ProtocolConnection, client: Client): Records {
    const configurationRequests: (string | undefined)[][] = [];
    const logged: string[] = [];
    const publications: PublishDiagnosticsParams[] = [];
    const registrations: Registered[] = [];
    const waiting: { resolve: (params: PublishDiagnosticsParams) => void; uri: string }[] = [];
    connection.onRequest(ConfigurationRequest.type, async ({ items }) => {
        configurationRequests.push(items.map(({ section }) => section));
        await delay(client.configurationDelay ?? 0);
        if (client.refuses?.includes('configuration') === true) {
            throw refused('workspace/configuration');
        }
        return items.map(() => client.configuration ?? null);
    });
    connection.onRequest(RegistrationRequest.type, (params) => {
        if (client.refuses?.includes('registration') === true) {
            throw refused('client/registerCapability');
        }
        for (const registration of params.registrations) {
            const registerOptions: unknown = registration.registerOptions;
            registrations.push({ method: registration.method, registerOptions });
        }
    });
    connection.onNotification(LogMessageNotification.type, ({ message, type }) => {
        logged.push(`${type} ${message}`);
    });
    connection.onNotification(PublishDiagnosticsNotification.type, (params) => {
        publications.push(params);
        const index = waiting.findIndex(({ uri }) => uri === params.uri);
        if (index !== -1) {
            const [waiter] = waiting.splice(index, 1);
            waiter?.resolve(params);
        }
    });
    const published = async (uri: string): Promise<PublishDiagnosticsParams> =>
        await new Promise((resolve) => {
            waiting.push({ resolve, uri });
        });
    return { configurationRequests, logged, publications, published, registrations };
}

// value: vscode-languageclient always appends `--clientProcessId=<pid>` beside the transport flag, so
// the bin is spawned the way every editor spawns it.
// hazard: mutation credits a line to a test from what the bin reports on exit, so a session ends by
// the protocol's shutdown and exit, never by a signal that would drop the bin's last report.
async function spawned(client: Client): Promise<Session> {
    const child = spawn(process.execPath, [
        await installed,
        '--stdio',
        `--clientProcessId=${process.pid}`,
    ]);
    const closed = new Promise<void>((resolve) => {
        child.on('close', () => {
            resolve();
        });
    });
    const connection = createProtocolConnection(
        new StreamMessageReader(child.stdout),
        new StreamMessageWriter(child.stdin),
    );
    const records = answering(connection, client);
    connection.listen();
    return {
        ...records,
        [Symbol.asyncDispose]: async () => {
            await connection.sendRequest(ShutdownRequest.type).catch(() => undefined);
            await connection.sendNotification(ExitNotification.type);
            await Promise.race([closed, delay(2000)]);
            connection.dispose();
            child.kill();
        },
        connection,
        open: async (uri, text) => {
            const diagnostics = records.published(uri);
            await connection.sendNotification('textDocument/didOpen', {
                textDocument: { languageId: 'json', text, uri, version: 1 },
            });
            return await diagnostics;
        },
        settled: async () => {
            await delay(SETTLE_MS);
        },
    };
}

/** A conversation the server has not been initialized in. */
export async function uninitialized(): Promise<Session> {
    return await spawned({});
}

/** The `initialize` parameters of a client opening no folder, with `overrides` laid over them. */
export function initializeParams(overrides: Partial<InitializeParams> = {}): InitializeParams {
    return {
        capabilities: {},
        processId: process.pid,
        // oxlint-disable-next-line typescript/no-deprecated -- LSP 3.17 still requires rootUri in initialize, null when no folder is open
        rootUri: null,
        ...overrides,
    };
}

/** A conversation initialized with `params`, the client answering as `client` says, and what the server answered. */
export async function initialized(
    params: Partial<InitializeParams>,
    client: Client = {},
): Promise<Session & { readonly answer: InitializeResult }> {
    const session = await spawned(client);
    const answer = await session.connection.sendRequest(
        InitializeRequest.type,
        initializeParams(params),
    );
    await session.connection.sendNotification(InitializedNotification.type, {});
    return { ...session, answer };
}
