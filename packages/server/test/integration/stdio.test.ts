import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createProtocolConnection,
  DidOpenTextDocumentNotification,
  InitializedNotification,
  InitializeRequest,
  type InitializeResult,
  type ProtocolConnection,
  PublishDiagnosticsNotification,
  type PublishDiagnosticsParams,
  StreamMessageReader,
  StreamMessageWriter,
  TextDocumentSyncKind,
} from "vscode-languageserver-protocol/node";

const binPath = fileURLToPath(new URL("../../bin/hoverfly-lsp.js", import.meta.url));

const SIMULATION = JSON.stringify({
  data: { pairs: [] },
  meta: { schemaVersion: "v5.3" },
});

describe("hoverfly-lsp stdio integration", () => {
  let child: ChildProcessWithoutNullStreams;
  let connection: ProtocolConnection;

  beforeAll(() => {
    child = spawn(process.execPath, [binPath, "--stdio"], { stdio: "pipe" });
    connection = createProtocolConnection(
      new StreamMessageReader(child.stdout),
      new StreamMessageWriter(child.stdin),
    );
    connection.listen();
  });

  afterAll(() => {
    connection.dispose();
    child.kill();
  });

  it("returns a clean InitializeResult and empty diagnostics on didOpen", async () => {
    // Given - an initialize handshake
    const result: InitializeResult = await connection.sendRequest(InitializeRequest.type, {
      processId: process.pid,
      rootUri: null,
      capabilities: {},
    });

    // Then - it advertises incremental text sync and identifies itself
    expect(result.capabilities.textDocumentSync).toBe(TextDocumentSyncKind.Incremental);
    expect(result.serverInfo?.name).toBe("hoverfly-lsp");

    void connection.sendNotification(InitializedNotification.type, {});

    // Given - a published-diagnostics listener wired before opening the document
    const diagnostics = new Promise<PublishDiagnosticsParams>((resolve) => {
      connection.onNotification(PublishDiagnosticsNotification.type, resolve);
    });

    // Given - opening a valid (empty) Hoverfly simulation
    void connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri: "file:///test.hoverfly.json",
        languageId: "json",
        version: 1,
        text: SIMULATION,
      },
    });

    // Then - the server publishes an empty diagnostics list (no-op validate this phase)
    const published = await diagnostics;
    expect(published.uri).toBe("file:///test.hoverfly.json");
    expect(published.diagnostics).toEqual([]);
  });
});
