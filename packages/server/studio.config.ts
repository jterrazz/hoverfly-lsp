import { test } from '@jterrazz/test/config';
import { defineConfig } from '@jterrazz/typescript/config';

export default defineConfig({ kind: 'cli', platform: 'node', presets: [test()] });
