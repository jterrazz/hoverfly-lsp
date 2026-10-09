import { startServer } from './server.js';

// outside: esbuild defines the manifest's version at build time, so the bundle reads no package.json.
declare const HOVERFLY_LSP_VERSION: string;

const HELP = `hoverfly-lsp — Language Server for Hoverfly JSON simulation files

Usage: hoverfly-lsp [transport] [options]

Transports (default: --stdio):
  --stdio             Communicate over stdin/stdout (default)
  --node-ipc          Communicate over Node IPC (parent process channel)
  --socket=PORT       Connect over a TCP socket on PORT
  --pipe=NAME         Communicate over a named pipe

Options:
  --version, -v       Print the version and exit
  --help, -h          Print this help and exit
`;

// outside: vscode-languageclient appends `--clientProcessId=<pid>` to every spawn so the server
// exits with its editor; refusing it would crash every editor-launched server.
function isAcceptedArg(arg: string): boolean {
    return (
        arg === '--stdio' ||
        arg === '--node-ipc' ||
        arg === '--socket' ||
        arg === '--pipe' ||
        arg.startsWith('--socket=') ||
        arg.startsWith('--pipe=') ||
        arg === '--clientProcessId' ||
        arg.startsWith('--clientProcessId=') ||
        /^\d+$/u.test(arg)
    );
}

// outside: the toolchain's refusal() is a devDependency a published bin cannot import, so the
// four parts of a refusal (found, why, fix, read) are written here by hand.
function refusal(argument: string): string {
    return [
        `found: the argument "${argument}", which names no transport and no option`,
        'why: an editor starts the server with one transport, and an argument it cannot read would be ignored in silence',
        'fix: pass --stdio (the default), --node-ipc, --socket=PORT or --pipe=NAME',
        'read: hoverfly-lsp --help',
        '',
    ].join('\n');
}

/** The command: `--version` and `--help` answer, an unknown flag is refused, and the transport is left to vscode-languageserver/node, which reads process.argv. */
export function main(argv: readonly string[] = process.argv.slice(2)): void {
    if (argv.includes('--version') || argv.includes('-v')) {
        process.stdout.write(`${HOVERFLY_LSP_VERSION}\n`);
        return;
    }
    if (argv.includes('--help') || argv.includes('-h')) {
        process.stdout.write(HELP);
        return;
    }

    const unknown = argv.find((arg) => !isAcceptedArg(arg));
    if (unknown !== undefined) {
        process.stderr.write(refusal(unknown));
        process.exitCode = 1;
        return;
    }

    startServer();
}
