#!/usr/bin/env node
/*
 * Thin launcher for the single-file esbuild bundle (dist/cli.cjs, CommonJS). Importing it runs
 * the bundle's `main()` side effect: validate CLI flags, then start the language server over
 * the selected transport.
 */
import "../dist/cli.cjs";
