import { startStdioServer } from "./server.js";

/**
 * CLI entry point. Scaffold phase supports stdio only (the default and only transport
 * for now). `--node-ipc` / `--socket` arrive with the full server phase.
 */
export function main(argv: readonly string[] = process.argv.slice(2)): void {
  const transport = argv.find((arg) => arg === "--stdio" || arg === "--node-ipc");
  if (transport !== undefined && transport !== "--stdio") {
    process.stderr.write(`hoverfly-lsp: transport ${transport} is not supported yet\n`);
    process.exitCode = 1;
    return;
  }
  startStdioServer();
}
