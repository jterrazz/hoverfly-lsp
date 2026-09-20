import { specification } from '@jterrazz/test';
import { afterAll } from 'vitest';

/*
 * The server spec drives the BUILT binary over stdio — it spawns the process itself, frames its
 * own JSON-RPC and owns the handshake, so the runner starts no service: what it brings is the
 * `.call()` seam that makes the spawn a chain with a result rather than a bare test body.
 */
export const { cleanup, integration } = await specification.integration();

afterAll(cleanup);
