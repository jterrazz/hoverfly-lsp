import { specification } from '@jterrazz/test';
import { afterAll } from 'vitest';

/*
 * The analysis package has no database and no process to start: what earns these specs the
 * folder is the OTHER half of the fork — an oracle on disk. Every one of them stands on
 * `testdata/`, the behavioural contract owned by `testdata/README.md`, and reads the full
 * `doValidation` / `doComplete` / `doHover` pipeline rather than one module.
 */
export const { cleanup, integration } = await specification.integration();

afterAll(cleanup);
