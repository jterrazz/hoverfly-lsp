/*
 * Bundle entrypoint: the executable program that `bin/hoverfly-lsp.js` loads via the esbuild
 * bundle. Kept separate from `cli.ts` so `cli.ts` stays a pure, testable module (it exports
 * `main`) while this file is the side-effecting "run it" shim.
 */
import { main } from "./cli.js";

main();
