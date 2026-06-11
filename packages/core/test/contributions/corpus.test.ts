/**
 * ON-DISK FOURSLASH CORPUS — the completion/hover analogue of the diagnostics golden corpus
 * (`testdata/{valid,invalid}` + `.diagnostics.golden`, run by `test/semantic/golden.test.ts`).
 *
 * For every `testdata/completion/**\/*.hoverfly.json` and `testdata/hover/**\/*.hoverfly.json`
 * fixture this runner:
 *
 *   1. strips the `⟦⟧` / `⟦name⟧` cursor markers (reusing the fourslash harness) to recover the
 *      clean simulation text plus each marker's offset;
 *   2. asserts the marker-stripped document is itself a VALID simulation (zero diagnostics) —
 *      UNLESS the fixture lives under a `.../broken/` subdir (mid-typing / invalid-doc cases);
 *   3. builds the real language service (`createHoverflyLanguageService`, honouring an optional
 *      per-fixture `settings` block from the sidecar — e.g. `registeredActions` for
 *      postServeAction completion);
 *   4. runs `doComplete` (completion tree) or `doHover` (hover tree) at each marker offset; and
 *   5. asserts the sibling `<case>.expect.json` sidecar's `includes` / `excludes` / `count` /
 *      `kindOf` for that marker.
 *
 * All labels/messages come from the real service — nothing is hardcoded here. This file is purely
 * ADDITIVE; it does not touch the existing inline contribution tests.
 *
 * ──────────────────────────────────────────────────────────────────────────────────────────────
 * INSPECT / REGEN HELPER
 *
 *   CORPUS_DUMP=<substr> npx vitest --run packages/core/test/contributions/corpus.test.ts
 *
 * prints (straight to stdout, so no `--disableConsoleIntercept` is needed), for every fixture whose
 * relative path contains <substr> (use `1` / `all` to match all), the ACTUAL completion labels
 * (with kinds) or rendered hover markdown at each marker — so you can author or update an
 * `.expect.json` against ground truth. Dumping does NOT change the assertions; it is an inspection
 * aid that runs alongside them. Example: `CORPUS_DUMP=method-value npx vitest --run ...corpus.test.ts`.
 *
 * The sidecar schema and "how to add a fixture" live in `testdata/completion/README.md` and
 * `testdata/hover/README.md`.
 */

import { glob } from "glob";
import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";
import { CompletionItemKind } from "vscode-languageserver-types";

import { createHoverflyLanguageService } from "../../src/service.js";
import {
  type CompletionMarkerExpectation,
  type HoverMarkerExpectation,
  loadCorpusExpectation,
  stripMarkersToOffsets,
} from "../fourslash/harness.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

/** When set, dump actual results for fixtures whose relpath contains this substring (`1`/`all` = every fixture). */
const DUMP = process.env["CORPUS_DUMP"];

/** Reverse map CompletionItemKind number → name (`12` → `"Value"`, `20` → `"EnumMember"`). */
const KIND_NAMES: Record<number, string> = Object.fromEntries(
  Object.entries(CompletionItemKind)
    .filter(([, v]) => typeof v === "number")
    .map(([name, value]) => [value as number, name]),
);

function fixtureUri(relPath: string): string {
  // Preserve the `*.hoverfly.json` suffix so the D3 filename gate accepts the document.
  return `file:///${relPath}`;
}

function shouldDump(relPath: string): boolean {
  if (DUMP === undefined) {
    return false;
  }
  if (DUMP === "1" || DUMP === "all" || DUMP === "") {
    return true;
  }
  return relPath.includes(DUMP);
}

/** `true` when a fixture is deliberately invalid (mid-typing / broken JSON) and skips the validity guard. */
function isBroken(relPath: string): boolean {
  return relPath.split("/").includes("broken");
}

const completionFixtures = await glob("testdata/completion/**/*.hoverfly.json", { cwd: repoRoot });
const hoverFixtures = await glob("testdata/hover/**/*.hoverfly.json", { cwd: repoRoot });

interface Prepared {
  readonly text: string;
  readonly offsets: ReadonlyMap<string, number>;
  readonly settings: ReturnType<typeof loadCorpusExpectation>["settings"];
  readonly markers: ReturnType<typeof loadCorpusExpectation>["markers"];
}

/** Strip markers, load the sidecar, and assert each fixture/sidecar invariant up front. */
function prepare(relPath: string): Prepared {
  const source = readFileSync(join(repoRoot, relPath), "utf8");
  const { text, offsets } = stripMarkersToOffsets(source);
  const sidecarPath = join(repoRoot, relPath.replace(/\.hoverfly\.json$/, ".expect.json"));
  const expectation = loadCorpusExpectation(sidecarPath);

  // Every declared marker must exist in the document, and vice-versa (catch typos either side).
  for (const name of Object.keys(expectation.markers)) {
    expect(
      offsets.has(name),
      `${relPath}: sidecar declares marker '${name || "(default)"}' but the fixture has no such ⟦⟧ marker`,
    ).toBe(true);
  }
  for (const name of offsets.keys()) {
    expect(
      name in expectation.markers,
      `${relPath}: fixture has marker '${name || "(default)"}' with no expectation in ${basename(sidecarPath)}`,
    ).toBe(true);
  }

  return { text, offsets, settings: expectation.settings, markers: expectation.markers };
}

describe("corpus: testdata/completion", () => {
  it("finds completion fixtures", () => {
    // Given - the on-disk completion corpus
    // Then - it is not empty (guards against a broken glob path)
    expect(completionFixtures.length).toBeGreaterThan(0);
  });

  it.each(completionFixtures)("%s", async (relPath) => {
    const { text, offsets, settings, markers } = prepare(relPath);
    const service = createHoverflyLanguageService([], settings ?? {});
    const document = TextDocument.create(fixtureUri(relPath), "json", 1, text);

    // Marker-stripped fixture must be a valid simulation unless it lives under `broken/`.
    if (!isBroken(relPath)) {
      const diagnostics = await service.doValidation(document);
      expect(
        diagnostics.map((d) => `${String(d.code)}: ${d.message}`),
        `${relPath}: marker-stripped fixture must be a VALID simulation (zero diagnostics). ` +
          `Place it under a .../broken/ subdir if it is intentionally mid-typing/invalid.`,
      ).toEqual([]);
    }

    for (const [marker, expectation] of Object.entries(markers)) {
      const offset = offsets.get(marker)!;
      const list = await service.doComplete(document, document.positionAt(offset));
      const items = list?.items ?? [];
      const labels = items.map((i) => i.label);
      const where = `${relPath} @ marker '${marker || "(default)"}'`;

      if (shouldDump(relPath)) {
        const rows = items
          .map((i) => `  ${i.label}  [${KIND_NAMES[i.kind ?? -1] ?? i.kind ?? "?"}]`)
          .join("\n");
        process.stdout.write(`\n[CORPUS_DUMP] completion ${where} (${labels.length})\n${rows}\n`);
      }

      const exp = expectation as CompletionMarkerExpectation;
      for (const label of exp.includes ?? []) {
        expect(labels, `${where}: missing completion '${label}'`).toContain(label);
      }
      for (const label of exp.excludes ?? []) {
        expect(labels, `${where}: unexpected completion '${label}'`).not.toContain(label);
      }
      if (exp.count !== undefined) {
        expect(
          labels.length,
          `${where}: expected ${exp.count} completions, got ${labels.length} [${labels.join(", ")}]`,
        ).toBe(exp.count);
      }
      for (const [label, kindName] of Object.entries(exp.kindOf ?? {})) {
        const item = items.find((i) => i.label === label);
        expect(item, `${where}: no completion '${label}' to check kind`).toBeDefined();
        const actual = item?.kind === undefined ? "(none)" : (KIND_NAMES[item.kind] ?? item.kind);
        expect(actual, `${where}: completion '${label}' kind`).toBe(kindName);
      }
    }
  });
});

/** Flatten a Hover's contents to a single markdown string (mirrors the harness renderer). */
function renderHover(
  contents: Awaited<ReturnType<ReturnType<typeof createHoverflyLanguageService>["doHover"]>>,
): string {
  if (!contents) {
    return "";
  }
  const c = contents.contents;
  if (typeof c === "string") {
    return c;
  }
  if (Array.isArray(c)) {
    return c.map((x) => (typeof x === "string" ? x : x.value)).join("\n");
  }
  return c.value;
}

describe("corpus: testdata/hover", () => {
  it("finds hover fixtures", () => {
    // Given - the on-disk hover corpus
    // Then - it is not empty
    expect(hoverFixtures.length).toBeGreaterThan(0);
  });

  it.each(hoverFixtures)("%s", async (relPath) => {
    const { text, offsets, settings, markers } = prepare(relPath);
    const service = createHoverflyLanguageService([], settings ?? {});
    const document = TextDocument.create(fixtureUri(relPath), "json", 1, text);

    if (!isBroken(relPath)) {
      const diagnostics = await service.doValidation(document);
      expect(
        diagnostics.map((d) => `${String(d.code)}: ${d.message}`),
        `${relPath}: marker-stripped fixture must be a VALID simulation (zero diagnostics). ` +
          `Place it under a .../broken/ subdir if it is intentionally mid-typing/invalid.`,
      ).toEqual([]);
    }

    for (const [marker, expectation] of Object.entries(markers)) {
      const offset = offsets.get(marker)!;
      const hover = await service.doHover(document, document.positionAt(offset));
      const rendered = renderHover(hover);
      const where = `${relPath} @ marker '${marker || "(default)"}'`;

      if (shouldDump(relPath)) {
        process.stdout.write(`\n[CORPUS_DUMP] hover ${where}\n${rendered || "<no hover>"}\n`);
      }

      const exp = expectation as HoverMarkerExpectation;
      for (const fragment of exp.includes ?? []) {
        expect(rendered, `${where}: hover should include '${fragment}'`).toContain(fragment);
      }
      for (const fragment of exp.excludes ?? []) {
        expect(rendered, `${where}: hover should NOT include '${fragment}'`).not.toContain(
          fragment,
        );
      }
    }
  });
});
