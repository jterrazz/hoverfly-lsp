import { oxlint } from '@jterrazz/typescript';
import { defineConfig } from 'oxlint';

export default defineConfig({
    extends: [oxlint.node],
    ignorePatterns: ['**/dist/**', 'testdata/**'],
});
