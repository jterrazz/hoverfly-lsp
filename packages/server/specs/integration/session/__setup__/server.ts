import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdtemp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    createProtocolConnection,
    InitializedNotification,
    InitializeRequest,
    PublishDiagnosticsNotification,
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

/** A language-server conversation with the packed bin, ended when the scope that holds it closes. */
export type Session = AsyncDisposable & {
    readonly connection: ProtocolConnection;
    /** Opens a document and answers the diagnostics the server publishes for it. */
    readonly open: (uri: string, text: string) => Promise<PublishDiagnosticsParams>;
    /** Answers the next diagnostics the server publishes for `uri`. */
    readonly published: (uri: string) => Promise<PublishDiagnosticsParams>;
};

// value: vscode-languageclient always appends `--clientProcessId=<pid>` beside the transport flag, so
// the bin is spawned the way every editor spawns it.
async function spawned(): Promise<{ connection: ProtocolConnection; end: () => void }> {
    const child = spawn(process.execPath, [
        await installed,
        '--stdio',
        `--clientProcessId=${process.pid}`,
    ]);
    const connection = createProtocolConnection(
        new StreamMessageReader(child.stdout),
        new StreamMessageWriter(child.stdin),
    );
    connection.listen();
    return {
        connection,
        end: () => {
            connection.dispose();
            child.kill();
        },
    };
}

function sessionOf(connection: ProtocolConnection, end: () => void): Session {
    const published = async (uri: string): Promise<PublishDiagnosticsParams> =>
        await new Promise((resolve) => {
            const listener = connection.onNotification(
                PublishDiagnosticsNotification.type,
                (params) => {
                    if (params.uri === uri) {
                        listener.dispose();
                        resolve(params);
                    }
                },
            );
        });
    return {
        [Symbol.asyncDispose]: async () => {
            end();
        },
        connection,
        open: async (uri, text) => {
            const diagnostics = published(uri);
            await connection.sendNotification('textDocument/didOpen', {
                textDocument: { languageId: 'json', text, uri, version: 1 },
            });
            return await diagnostics;
        },
        published,
    };
}

/** A conversation the server has not been initialized in. */
export async function uninitialized(): Promise<Session> {
    const { connection, end } = await spawned();
    return sessionOf(connection, end);
}

/** A conversation initialized with `params`, and what the server answered to it. */
export async function initialized(
    params: Partial<InitializeParams>,
): Promise<Session & { readonly answer: InitializeResult }> {
    const { connection, end } = await spawned();
    const answer = await connection.sendRequest(InitializeRequest.type, {
        capabilities: {},
        processId: process.pid,
        // oxlint-disable-next-line typescript/no-deprecated -- LSP 3.17 still requires rootUri in initialize, null when no folder is open
        rootUri: null,
        ...params,
    });
    await connection.sendNotification(InitializedNotification.type, {});
    return { ...sessionOf(connection, end), answer };
}
