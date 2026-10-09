import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

// hazard: mutation runs these specs from a sandbox copy of the member, deeper than the checkout, so
// the corpus is found by walking up to it, never at a fixed depth.
/** The repository root, the first folder above this one that holds `testdata/`, with a trailing slash. */
export function repositoryRoot(): string {
    let folder = import.meta.dirname;
    while (!existsSync(join(folder, 'testdata'))) {
        const parent = dirname(folder);
        if (parent === folder) {
            throw new Error(`no testdata/ above ${import.meta.dirname}`);
        }
        folder = parent;
    }
    return `${folder}/`;
}

/** A repository path, named from the corpus specs' folder as `file()` reads one. */
export function fromCorpusSpecs(path: string): `../${string}` {
    const fromSpecs = relative(dirname(import.meta.dirname), join(repositoryRoot(), path));
    return `../${fromSpecs.slice('../'.length)}`;
}
