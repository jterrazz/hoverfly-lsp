# @jterrazz/hoverfly-lsp

A language server for [Hoverfly](https://hoverfly.io) simulation files: diagnostics, completion
and hover docs for `*.hoverfly.json`, over the Language Server Protocol.

```sh
npm i -g @jterrazz/hoverfly-lsp
hoverfly-lsp --stdio
```

```text
Usage: hoverfly-lsp [transport] [options]

Transports (default: --stdio):
  --stdio             Communicate over stdin/stdout (default)
  --node-ipc          Communicate over Node IPC (parent process channel)
  --socket=PORT       Connect over a TCP socket on PORT
  --pipe=NAME         Communicate over a named pipe

Options:
  --version, -v       Print the version and exit
  --help, -h          Print this help and exit
```

Editor setup, features and settings are in the
[repository README](https://github.com/jterrazz/hoverfly-lsp#readme); every diagnostic the server
reports is listed in
[docs/reference/diagnostics.md](https://github.com/jterrazz/hoverfly-lsp/blob/main/docs/reference/diagnostics.md).
