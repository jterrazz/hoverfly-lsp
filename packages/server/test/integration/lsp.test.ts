import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  type CompletionList,
  CompletionRequest,
  createProtocolConnection,
  type Diagnostic,
  DidChangeTextDocumentNotification,
  DidOpenTextDocumentNotification,
  DocumentDiagnosticRequest,
  ErrorCodes,
  HoverRequest,
  InitializedNotification,
  InitializeRequest,
  type InitializeResult,
  type ProtocolConnection,
  PublishDiagnosticsNotification,
  type PublishDiagnosticsParams,
  ResponseError,
  StreamMessageReader,
  StreamMessageWriter,
} from "vscode-languageserver-protocol/node";

const binPath = fileURLToPath(new URL("../../bin/hoverfly-lsp.js", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function readFixture(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), "utf8");
}

/** Spawn the bundled bin over stdio and wrap it in an LSP protocol connection. */
function spawnServer(): { child: ChildProcessWithoutNullStreams; connection: ProtocolConnection } {
  const child = spawn(process.execPath, [binPath, "--stdio"], { stdio: "pipe" });
  const connection = createProtocolConnection(
    new StreamMessageReader(child.stdout),
    new StreamMessageWriter(child.stdin),
  );
  connection.listen();
  return { child, connection };
}

/** Collect the next publishDiagnostics notification for a given uri. */
function nextDiagnostics(
  connection: ProtocolConnection,
  uri: string,
): Promise<PublishDiagnosticsParams> {
  return new Promise<PublishDiagnosticsParams>((resolve) => {
    const dispose = connection.onNotification(
      PublishDiagnosticsNotification.type,
      (params: PublishDiagnosticsParams) => {
        if (params.uri === uri) {
          dispose.dispose();
          resolve(params);
        }
      },
    );
  });
}

const codesOf = (diagnostics: readonly Diagnostic[]): string[] =>
  diagnostics.map((d) => String(d.code));

/** The error code carried by a rejected sendRequest, or undefined if it resolved. */
async function errorCodeOf(promise: Promise<unknown>): Promise<number | undefined> {
  try {
    await promise;
    return undefined;
  } catch (error: unknown) {
    return error instanceof ResponseError ? error.code : undefined;
  }
}

/**
 * The PUSH-diagnostics client capabilities: NO `textDocument.diagnostic`, so the server pushes
 * diagnostics on didOpen/didChange. Used by the push-path suites below.
 */
const PUSH_CLIENT_CAPABILITIES = {
  textDocument: {},
  workspace: {},
};

describe("hoverfly-lsp — initialize handshake", () => {
  let child: ChildProcessWithoutNullStreams;
  let connection: ProtocolConnection;

  beforeAll(() => {
    ({ child, connection } = spawnServer());
  });
  afterAll(() => {
    connection.dispose();
    child.kill();
  });

  it("advertises completion (with triggers), hover, and a pull diagnostic provider", async () => {
    // Given - a standard initialize
    const result: InitializeResult = await connection.sendRequest(InitializeRequest.type, {
      processId: process.pid,
      rootUri: null,
      capabilities: {},
    });
    const caps = result.capabilities;

    // Then - completion advertises the Hoverfly + Handlebars trigger characters
    expect(caps.completionProvider).toBeDefined();
    expect(caps.completionProvider?.triggerCharacters).toEqual(
      expect.arrayContaining(['"', "{", ".", "#", "@", "'", "("]),
    );
    // Then - hover is on
    expect(caps.hoverProvider).toBe(true);
    // Then - a pull diagnostic provider with single-file (non-workspace) semantics
    expect(caps.diagnosticProvider).toBeDefined();
    const diag = caps.diagnosticProvider as {
      interFileDependencies?: boolean;
      workspaceDiagnostics?: boolean;
    };
    expect(diag.interFileDependencies).toBe(false);
    expect(diag.workspaceDiagnostics).toBe(false);
    // Then - incremental open/close sync
    expect(result.serverInfo?.name).toBe("hoverfly-lsp");
  });
});

describe("hoverfly-lsp — $/lifecycle conformance", () => {
  it("rejects a feature request sent BEFORE initialize with ServerNotInitialized (-32002)", async () => {
    // Given - a freshly spawned server that has NOT been initialized
    const { child, connection } = spawnServer();
    try {
      // When - a hover request is sent before `initialize`
      const code = await errorCodeOf(
        connection.sendRequest(HoverRequest.type, {
          textDocument: { uri: "file:///before-init.hoverfly.json" },
          position: { line: 0, character: 0 },
        }),
      );
      // Then - the spec-mandated -32002 is returned (not a benign null result)
      expect(code).toBe(ErrorCodes.ServerNotInitialized);
    } finally {
      connection.dispose();
      child.kill();
    }
  });

  it("rejects a SECOND initialize with InvalidRequest (-32600)", async () => {
    // Given - a server that has already completed one initialize
    const { child, connection } = spawnServer();
    try {
      const first: InitializeResult = await connection.sendRequest(InitializeRequest.type, {
        processId: process.pid,
        rootUri: null,
        capabilities: {},
      });
      expect(first.capabilities).toBeDefined();

      // When - a second initialize is sent on the same connection
      const code = await errorCodeOf(
        connection.sendRequest(InitializeRequest.type, {
          processId: process.pid,
          rootUri: null,
          capabilities: {},
        }),
      );
      // Then - it is refused with -32600 (the first result still stands)
      expect(code).toBe(ErrorCodes.InvalidRequest);
    } finally {
      connection.dispose();
      child.kill();
    }
  });

  it("classifies a BOM-prefixed valid simulation as a simulation (no spurious HF101)", async () => {
    // Given - an initialized push-client and a valid simulation saved with a leading UTF-8 BOM
    const { child, connection } = spawnServer();
    try {
      await connection.sendRequest(InitializeRequest.type, {
        processId: process.pid,
        rootUri: null,
        capabilities: PUSH_CLIENT_CAPABILITIES,
      });
      void connection.sendNotification(InitializedNotification.type, {});

      const uri = "file:///bom.hoverfly.json";
      const valid = `{"data":{"pairs":[]},"meta":{"schemaVersion":"v5.3"}}`;
      const diagnostics = nextDiagnostics(connection, uri);
      // When - the BOM-prefixed document is opened
      void connection.sendNotification(DidOpenTextDocumentNotification.type, {
        textDocument: { uri, languageId: "json", version: 1, text: `﻿${valid}` },
      });

      // Then - zero diagnostics (the BOM is transparent; no HF101)
      const published = await diagnostics;
      expect(published.diagnostics).toEqual([]);
    } finally {
      connection.dispose();
      child.kill();
    }
  });
});

describe("hoverfly-lsp — push diagnostics (client without pull)", () => {
  let child: ChildProcessWithoutNullStreams;
  let connection: ProtocolConnection;

  beforeAll(async () => {
    ({ child, connection } = spawnServer());
    await connection.sendRequest(InitializeRequest.type, {
      processId: process.pid,
      rootUri: null,
      capabilities: PUSH_CLIENT_CAPABILITIES,
    });
    void connection.sendNotification(InitializedNotification.type, {});
  });
  afterAll(() => {
    connection.dispose();
    child.kill();
  });

  it("pushes multi-code diagnostics for an invalid fixture on didOpen", async () => {
    // Given - a fixture that produces three distinct HF codes (HF401/HF402/HF403)
    const uri = "file:///dangling-states.hoverfly.json";
    const text = readFixture("testdata/invalid/hf4xx/dangling-states.hoverfly.json");
    const diagnostics = nextDiagnostics(connection, uri);

    // When - the document is opened
    void connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri, languageId: "json", version: 1, text },
    });

    // Then - the published codes contain all three dangling-state diagnostics
    const published = await diagnostics;
    const codes = codesOf(published.diagnostics);
    expect(codes).toEqual(expect.arrayContaining(["HF401", "HF402", "HF403"]));
  });

  it("re-pushes updated diagnostics after an incremental edit breaks the doc", async () => {
    // Given - a valid simulation is open with empty diagnostics
    const uri = "file:///edit.hoverfly.json";
    const valid = `{\n  "data": { "pairs": [] },\n  "meta": { "schemaVersion": "v5.3" }\n}`;
    const opened = nextDiagnostics(connection, uri);
    void connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri, languageId: "json", version: 1, text: valid },
    });
    const initial = await opened;
    expect(initial.diagnostics).toEqual([]);

    // When - an incremental change replaces "pairs" with a structurally-invalid object
    const updated = nextDiagnostics(connection, uri);
    void connection.sendNotification(DidChangeTextDocumentNotification.type, {
      textDocument: { uri, version: 2 },
      contentChanges: [
        {
          // Replace the whole document (range omitted = full-document change).
          text: `{\n  "data": { "pairs": {} },\n  "meta": { "schemaVersion": "v5.3" }\n}`,
        },
      ],
    });

    // Then - the schema error surfaces as HF102 (re-tagged schema diagnostic)
    const published = await updated;
    expect(codesOf(published.diagnostics)).toContain("HF102");
  });

  it("publishes zero diagnostics for a non-simulation .json without crashing", async () => {
    // Given - arbitrary JSON in a plainly-named file (D3 gate -> [])
    const uri = "file:///config.json";
    const diagnostics = nextDiagnostics(connection, uri);
    void connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri,
        languageId: "json",
        version: 1,
        text: `{ "hello": "world" }`,
      },
    });

    // Then - empty diagnostics, server alive
    const published = await diagnostics;
    expect(published.diagnostics).toEqual([]);
  });

  it("places diagnostic ranges at UTF-16 code-unit offsets across an astral emoji", async () => {
    // Given - line 0 carries astral emoji 😊 (U+1F60A: 1 codepoint = 2 UTF-16 units); line 1 holds an unknown-matcher error
    const uri = "file:///emoji.hoverfly.json";
    const line0 = `{ "x": "😊😊", "data": { "pairs": [ {`;
    const line1 = `"request": { "path": [ { "matcher": "frobnicate", "value": "v" } ] },`;
    const line2 = `"response": { "status": 200 } } ] }, "meta": { "schemaVersion": "v5.3" } }`;
    const text = `${line0}\n${line1}\n${line2}`;
    const diagnostics = nextDiagnostics(connection, uri);
    void connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri, languageId: "json", version: 1, text },
    });

    // Then - an HF201 unknown-matcher diagnostic lands on line 1 at the matcher value.
    const published = await diagnostics;
    const hf201 = published.diagnostics.find((d) => String(d.code) === "HF201");
    expect(hf201).toBeDefined();
    // Line 1 is pure ASCII; its columns are unaffected by the astral emoji on line 0 (per-line UTF-16 offsetting, not global byte/codepoint)
    const valueStart = line1.indexOf(`"frobnicate"`);
    expect(hf201?.range.start.line).toBe(1);
    expect(hf201?.range.start.character).toBe(valueStart);
    expect(hf201?.range.end.character).toBe(valueStart + `"frobnicate"`.length);

    // Then - a second doc proves UTF-16 WIDTH: a matcher name with an astral emoji is measured in UTF-16 units (2 per emoji), so "😊exact" spans 9, not 8 codepoints
    const uri2 = "file:///emoji2.hoverfly.json";
    const prefix = `{"data":{"pairs":[{"request":{"path":[{"matcher":"😊exact",`;
    const text2 = `${prefix}"value":"x"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    const diag2 = nextDiagnostics(connection, uri2);
    void connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri: uri2, languageId: "json", version: 1, text: text2 },
    });
    const published2 = await diag2;
    const hf = published2.diagnostics.find((d) => String(d.code) === "HF201");
    // Width breakdown: quote(1) + 😊(2 UTF-16 units) + exact(5) + quote(1) = 9 (codepoints = 8).
    expect(hf).toBeDefined();
    expect((hf?.range.end.character ?? 0) - (hf?.range.start.character ?? 0)).toBe(9);
  });
});

describe("hoverfly-lsp — pull diagnostics (client with pull)", () => {
  let child: ChildProcessWithoutNullStreams;
  let connection: ProtocolConnection;
  const uri = "file:///pull.hoverfly.json";

  beforeAll(async () => {
    ({ child, connection } = spawnServer());
    await connection.sendRequest(InitializeRequest.type, {
      processId: process.pid,
      rootUri: null,
      // Advertise pull support so the server skips push.
      capabilities: { textDocument: { diagnostic: { dynamicRegistration: false } } },
    });
    void connection.sendNotification(InitializedNotification.type, {});
    void connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri,
        languageId: "json",
        version: 1,
        text: readFixture("testdata/invalid/hf4xx/dangling-states.hoverfly.json"),
      },
    });
  });
  afterAll(() => {
    connection.dispose();
    child.kill();
  });

  it("textDocument/diagnostic returns a full report with the same HF codes", async () => {
    // When - the client pulls diagnostics
    const report = (await connection.sendRequest(DocumentDiagnosticRequest.type, {
      textDocument: { uri },
    })) as { kind: string; items: Diagnostic[] };

    // Then - a full report carrying the multi-code set
    expect(report.kind).toBe("full");
    expect(codesOf(report.items)).toEqual(expect.arrayContaining(["HF401", "HF402", "HF403"]));
  });
});

describe("hoverfly-lsp — completion & hover", () => {
  let child: ChildProcessWithoutNullStreams;
  let connection: ProtocolConnection;

  beforeAll(async () => {
    ({ child, connection } = spawnServer());
    await connection.sendRequest(InitializeRequest.type, {
      processId: process.pid,
      rootUri: null,
      capabilities: PUSH_CLIENT_CAPABILITIES,
    });
    void connection.sendNotification(InitializedNotification.type, {});
  });
  afterAll(() => {
    connection.dispose();
    child.kill();
  });

  it("completes faker/helpers inside a templated body mustache (computed position)", async () => {
    // Given - a templated body mid-typing `{{fa`
    const uri = "file:///complete-template.hoverfly.json";
    const body = "{{fa";
    const text = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"templated":true,"body":"${body}"}}]},"meta":{"schemaVersion":"v5.3"}}`;
    void connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri, languageId: "json", version: 1, text },
    });

    // When - completion is requested at the cursor immediately after `{{fa`
    const cursor = text.indexOf(body) + body.length;
    // Position is line 0 (single line); character == offset since the doc is ASCII before cursor.
    const completions = (await connection.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 0, character: cursor },
    })) as CompletionList | null;
    const labels = (completions?.items ?? []).map((i) => i.label);

    // Then - faker and a helper are offered
    expect(labels).toContain("faker");
    expect(labels).toContain("randomFloat");
  });

  it("completes matcher names at a matcher-value position", async () => {
    // Given - an empty matcher value on request.path
    const uri = "file:///complete-matcher.hoverfly.json";
    const text = `{"data":{"pairs":[{"request":{"path":[{"matcher":""}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    void connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri, languageId: "json", version: 1, text },
    });

    // When - completion inside the empty quotes
    const cursor = text.indexOf(`"matcher":""`) + `"matcher":"`.length;
    const completions = (await connection.sendRequest(CompletionRequest.type, {
      textDocument: { uri },
      position: { line: 0, character: cursor },
    })) as CompletionList | null;
    const labels = (completions?.items ?? []).map((i) => i.label);

    // Then - registry matcher names are offered
    expect(labels).toEqual(expect.arrayContaining(["exact", "regex", "jsonpath"]));
  });

  it("hovers a matcher name and surfaces registry docs markdown", async () => {
    // Given - a "glob" matcher name on request.path
    const uri = "file:///hover-matcher.hoverfly.json";
    const text = `{"data":{"pairs":[{"request":{"path":[{"matcher":"glob","value":"x"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    void connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri, languageId: "json", version: 1, text },
    });

    // When - hover on the matcher name
    const cursor = text.indexOf(`"glob"`) + 2;
    const hover = await connection.sendRequest(HoverRequest.type, {
      textDocument: { uri },
      position: { line: 0, character: cursor },
    });

    // Then - the registry markdown is rendered
    const rendered = JSON.stringify(hover?.contents);
    expect(rendered).toContain("Glob (wildcard) match");
    expect(rendered).toContain("docs.hoverfly.io");
  });
});

describe("hoverfly-lsp — initializationOptions settings", () => {
  let child: ChildProcessWithoutNullStreams;
  let connection: ProtocolConnection;

  beforeAll(async () => {
    ({ child, connection } = spawnServer());
    // Provide registeredActions through initializationOptions (the no-config fallback path).
    await connection.sendRequest(InitializeRequest.type, {
      processId: process.pid,
      rootUri: null,
      capabilities: PUSH_CLIENT_CAPABILITIES,
      initializationOptions: { registeredActions: ["knownAction"] },
    });
    void connection.sendNotification(InitializedNotification.type, {});
  });
  afterAll(() => {
    connection.dispose();
    child.kill();
  });

  it("emits HF602 for a postServeAction outside the configured registeredActions", async () => {
    // Given - a fixture using an action NOT in the allowlist
    const uri = "file:///postserve.hoverfly.json";
    const text = readFixture(
      "testdata/invalid/globalactions/hf602-postserveaction-silent-without-settings.hoverfly.json",
    );
    const diagnostics = nextDiagnostics(connection, uri);
    void connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: { uri, languageId: "json", version: 1, text },
    });

    // Then - HF602 fires because registeredActions is configured and the action is unknown
    const published = await diagnostics;
    expect(codesOf(published.diagnostics)).toContain("HF602");
  });
});

describe("hoverfly-lsp — performance sanity", () => {
  let child: ChildProcessWithoutNullStreams;
  let connection: ProtocolConnection;
  const uri = "file:///perf.hoverfly.json";

  beforeAll(async () => {
    ({ child, connection } = spawnServer());
    await connection.sendRequest(InitializeRequest.type, {
      processId: process.pid,
      rootUri: null,
      capabilities: { textDocument: { diagnostic: { dynamicRegistration: false } } },
    });
    void connection.sendNotification(InitializedNotification.type, {});
    void connection.sendNotification(DidOpenTextDocumentNotification.type, {
      textDocument: {
        uri,
        languageId: "json",
        version: 1,
        text: readFixture("testdata/valid/realworld/large-mixed-perf-canary.hoverfly.json"),
      },
    });
  });
  afterAll(() => {
    connection.dispose();
    child.kill();
  });

  it("pull round-trip on the 30+ pair realworld file completes under 2s", async () => {
    // When - the diagnostic pull round-trips over the wire
    const start = performance.now();
    const report = (await connection.sendRequest(DocumentDiagnosticRequest.type, {
      textDocument: { uri },
    })) as { kind: string; items: Diagnostic[] };
    const elapsed = performance.now() - start;

    // Then - it returns a report well within a loose CI bound
    expect(report.kind).toBe("full");
    expect(elapsed).toBeLessThan(2000);
  });
});
