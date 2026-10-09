import { specification } from '@jterrazz/test';
import { afterAll } from 'vitest';

export const { cleanup, integration } = await specification.integration();

afterAll(cleanup);
