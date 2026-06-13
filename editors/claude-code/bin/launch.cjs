#!/usr/bin/env node
/*
 * Hoverfly-lsp Claude Code launcher.
 *
 * Claude Code starts this with `node ${CLAUDE_PLUGIN_ROOT}/bin/launch.cjs --stdio` (see
 * ../.lsp.json). Its only job is to locate the hoverfly-lsp server bundle and run it
 * in-process so the server inherits this process's stdin/stdout (the LSP stdio transport).
 *
 * Resolution order (first hit wins):
 *
 *   1. $HOVERFLY_LSP_PATH      — explicit override. Either the server bundle (dist/cli.cjs)
 *                               directly, or a directory containing it. Lets users point at
 *                               any build (a checkout, a global install, a custom path).
 *   2. node_modules            — a `@jterrazz/hoverfly-lsp` package installed next to the project
 *                               or the plugin (the future "npm-installed" path). Resolved via
 *                               Node's own algorithm from both the cwd and this file's directory.
 *   3. dev fallback            — the repo-relative server bundle at
 *                               ../../../packages/server/dist/cli.cjs, for running straight from
 *                               a hoverfly-lsp checkout before anything is published.
 *
 * NOTE: a marketplace install COPIES the plugin into Claude Code's cache, so the dev fallback
 * (3) only resolves when the plugin runs in place from the repo (skills-dir auto-load or a
 * local-path marketplace pointing at editors/claude-code). A published plugin must instead
 * bundle the server or npm-depend on `@jterrazz/hoverfly-lsp` so that (2) resolves. See README.
 */

"use strict";

const fs = require("node:fs");
const { createRequire } = require("node:module");
const path = require("node:path");

const BUNDLE_RELATIVE = path.join("dist", "cli.cjs");

/** Return `candidate` if it resolves to the server bundle file, else undefined. */
function resolveBundle(candidate) {
  if (!candidate) {
    return undefined;
  }
  try {
    const stat = fs.statSync(candidate);
    if (stat.isFile()) {
      return candidate;
    }
    if (stat.isDirectory()) {
      const inDir = path.join(candidate, BUNDLE_RELATIVE);
      if (fs.existsSync(inDir)) {
        return inDir;
      }
    }
  } catch {
    // Candidate does not exist — fall through.
  }
  return undefined;
}

/** Resolve the `@jterrazz/hoverfly-lsp` package's bundle from node_modules, from several base dirs. */
function resolveFromNodeModules() {
  const bases = [process.cwd(), __dirname];
  for (const base of bases) {
    try {
      const req = createRequire(path.join(base, "noop.js"));
      // The package's "main"/bin both lead to the bundle; resolve the package root via its
      // Package.json so we don't depend on a specific export map.
      const pkgJson = req.resolve("@jterrazz/hoverfly-lsp/package.json");
      const bundle = path.join(path.dirname(pkgJson), BUNDLE_RELATIVE);
      if (fs.existsSync(bundle)) {
        return bundle;
      }
    } catch {
      // Not installed under this base — try the next.
    }
  }
  return undefined;
}

function resolveServerBundle() {
  // 1. Explicit override.
  const fromEnv = resolveBundle(process.env.HOVERFLY_LSP_PATH);
  if (fromEnv) {
    return fromEnv;
  }

  // 2. npm-installed package (future published path).
  const fromNm = resolveFromNodeModules();
  if (fromNm) {
    return fromNm;
  }

  // 3. Dev fallback: repo-relative server bundle.
  //    Path editors/claude-code/bin/launch.cjs -> packages/server/dist/cli.cjs
  const devBundle = path.resolve(
    __dirname,
    "..",
    "..",
    "..",
    "packages",
    "server",
    "dist",
    "cli.cjs",
  );
  if (fs.existsSync(devBundle)) {
    return devBundle;
  }

  return undefined;
}

const bundle = resolveServerBundle();

if (!bundle) {
  process.stderr.write(
    "hoverfly-lsp: could not locate the language server bundle.\n" +
      "Tried $HOVERFLY_LSP_PATH, a node_modules `@jterrazz/hoverfly-lsp` install, and the\n" +
      "repo-relative dev bundle (packages/server/dist/cli.cjs). Install `@jterrazz/hoverfly-lsp`\n" +
      "(npm i -g @jterrazz/hoverfly-lsp or as a project dependency), or set HOVERFLY_LSP_PATH to\n" +
      "the server's dist/cli.cjs.\n",
  );
  process.exit(1);
}

// Run the bundle in-process. cli.cjs reads process.argv (it understands --stdio, etc.) and
// Starts the LSP server, inheriting our stdin/stdout. argv already carries the flags Claude
// Code passed us (e.g. --stdio).
require(bundle);
