// outside: VS Code activates the extension from `contributes.languages.filenamePatterns` (1.74+),
// so `activationEvents` stays empty.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { workspace } from 'vscode';
import type { ExtensionContext } from 'vscode';
import { LanguageClient, TransportKind } from 'vscode-languageclient/node';
import type { LanguageClientOptions, ServerOptions } from 'vscode-languageclient/node';

import { resolveServer } from './server-resolution.js';

let client: LanguageClient | undefined;

// hazard: the .cjs bundle, never the bin launcher — vscode-languageclient forks the module under
// the editor's Electron Node, where the `.js` launcher's reliance on `"type": "module"` can fail to
// load.
const BUNDLED_SERVER_MODULE = join('server', 'dist', 'cli.cjs');

export async function activate(context: ExtensionContext): Promise<void> {
    const config = workspace.getConfiguration('hoverfly');
    const resolved = resolveServer({
        configuredPath: config.get<string>('server.path'),
        workspaceRoot: workspace.workspaceFolders?.[0]?.uri.fsPath,
        bundledModule: context.asAbsolutePath(BUNDLED_SERVER_MODULE),
        exists: existsSync,
        join,
    });

    const serverOptions: ServerOptions = {
        run: {
            module: resolved.module,
            args: ['--stdio'],
            transport: TransportKind.stdio,
        },
        debug: {
            module: resolved.module,
            args: ['--stdio'],
            transport: TransportKind.stdio,
            options: { execArgv: ['--nolazy', '--inspect=6009'] },
        },
    };

    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { language: 'hoverfly-simulation' },
            // invariant: a *.hoverfly.json left on the built-in json language id is caught too; the
            // server's content fingerprint keeps it from claiming plain .json files.
            { language: 'json', pattern: '**/*.hoverfly.json' },
        ],
        synchronize: {
            fileEvents: workspace.createFileSystemWatcher('**/*.hoverfly.json'),
        },
        initializationOptions: {
            registeredActions: config.get<string[]>('registeredActions') ?? [],
        },
        outputChannelName: 'Hoverfly LSP',
    };

    client = new LanguageClient(
        'hoverfly-lsp',
        'Hoverfly Language Server',
        serverOptions,
        clientOptions,
    );

    await client.start();
}

export async function deactivate(): Promise<void> {
    if (client === undefined) {
        return;
    }
    await client.stop();
    client = undefined;
}
