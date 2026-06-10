/*
 * Server resolution: decide which `hoverfly-lsp` binary the extension should spawn.
 *
 * Pure, side-effect-free, and dependency-free so it can be unit-tested without VS Code or a real
 * filesystem (the existence check is injected). `extension.ts` wires the real `fs.existsSync` and
 * the real config/extension paths into `resolveServer`.
 *
 * Resolution order (highest priority first):
 *   1. Explicit override   — the `hoverfly.server.path` setting, if set to a non-empty string.
 *   2. Workspace install   — `<workspaceRoot>/node_modules/.bin/hoverfly-lsp` if it exists on disk
 *                            (lets a project pin its own server version via `npm install`).
 *   3. Bundled server      — the copy of the `hoverfly-lsp` bin shipped inside the extension
 *                            (`<extensionRoot>/server/bin/hoverfly-lsp.js`), the zero-install path.
 *
 * The result is always launched as `node <module> --stdio` so the same logic works whether the
 * resolved path is a `.js` entry (bundled / npm bin shim) or a platform launcher — we never rely
 * on the file's executable bit.
 */

/** A resolved server command: run `node` with these args (the launcher module + transport flag). */
interface ResolvedServer {
  /** Absolute path to the Node entry module to execute (`bin/hoverfly-lsp.js` or `.bin` shim). */
  readonly module: string;
  /** How the server was located, for logging / diagnostics. */
  readonly source: "bundled" | "configuredPath" | "workspaceBin";
}

/** Inputs needed to resolve the server, all injected so the function stays testable. */
interface ResolveServerInput {
  /** Value of the `hoverfly.server.path` setting (may be undefined/empty). */
  readonly configuredPath: string | undefined;
  /** First workspace folder's filesystem path, or undefined when no folder is open. */
  readonly workspaceRoot: string | undefined;
  /** Absolute path to the extension's bundled server entry module. */
  readonly bundledModule: string;
  /** Existence predicate for filesystem paths (inject `fs.existsSync` in production). */
  readonly exists: (path: string) => boolean;
  /** Path joiner (inject `path.join`; defaulted to a POSIX-ish join for tests). */
  readonly join?: (...segments: string[]) => string;
}

const defaultJoin = (...segments: string[]): string => segments.join("/").replace(/\/{2,}/g, "/");

/** Trim a configured path; treat whitespace-only as unset. */
function normalizeConfigured(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

/**
 * Resolve the server command per the documented precedence. Always returns a result: the bundled
 * server is the guaranteed fallback, so the extension never fails to find a server to launch.
 */
function resolveServer(input: ResolveServerInput): ResolvedServer {
  const join = input.join ?? defaultJoin;

  // 1. Explicit setting wins unconditionally (the user asked for this exact binary).
  const configured = normalizeConfigured(input.configuredPath);
  if (configured !== undefined) {
    return { module: configured, source: "configuredPath" };
  }

  // 2. Project-local install: <workspaceRoot>/node_modules/.bin/hoverfly-lsp
  if (input.workspaceRoot !== undefined) {
    const workspaceBin = join(input.workspaceRoot, "node_modules", ".bin", "hoverfly-lsp");
    if (input.exists(workspaceBin)) {
      return { module: workspaceBin, source: "workspaceBin" };
    }
  }

  // 3. Bundled server shipped inside the extension (always present).
  return { module: input.bundledModule, source: "bundled" };
}

export { resolveServer };
