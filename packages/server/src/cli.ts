import { createRequire } from "node:module";

import { startServer } from "./server.js";

/**
 * The package version. In the esbuild bundle this is replaced at build time via `define`
 * (`HOVERFLY_LSP_VERSION`). In the unbundled tsc output (tests / typecheck) that define is
 * absent, so we fall back to reading package.json relative to this module.
 */
declare const HOVERFLY_LSP_VERSION: string | undefined;

function readVersion(): string {
  if (typeof HOVERFLY_LSP_VERSION === "string") {
    return HOVERFLY_LSP_VERSION;
  }
  try {
    const require = createRequire(import.meta.url);
    const pkg = require("../package.json") as { version?: string };
    return pkg.version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

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

/** Recognised transport flags; everything else (besides --version/--help) is an error. */
function isKnownTransportFlag(arg: string): boolean {
  return (
    arg === "--stdio" ||
    arg === "--node-ipc" ||
    arg === "--socket" ||
    arg === "--pipe" ||
    arg.startsWith("--socket=") ||
    arg.startsWith("--pipe=") ||
    // The integer that follows a bare `--socket` / `--pipe`.
    /^\d+$/.test(arg)
  );
}

/**
 * CLI entry point.
 *
 * `--version` / `--help` short-circuit. Otherwise the transport flags are validated here and
 * the actual transport selection is delegated to `vscode-languageserver/node`, which reads
 * `process.argv` (it understands `--stdio`, `--node-ipc`, `--socket[=PORT]`, `--pipe[=NAME]`).
 * An unrecognised flag prints help to stderr and exits 1.
 */
export function main(argv: readonly string[] = process.argv.slice(2)): void {
  if (argv.includes("--version") || argv.includes("-v")) {
    process.stdout.write(`${readVersion()}\n`);
    return;
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    process.stdout.write(HELP);
    return;
  }

  const unknown = argv.find((arg) => !isKnownTransportFlag(arg));
  if (unknown !== undefined) {
    process.stderr.write(`hoverfly-lsp: unknown argument "${unknown}"\n\n${HELP}`);
    process.exitCode = 1;
    return;
  }

  startServer();
}
