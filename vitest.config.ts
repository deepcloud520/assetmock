import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';
export default defineConfig({ resolve: { alias: { '@': resolve('src') } }, test: { include: ['tests/**/*.test.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx', 'scripts/**/*.test.ts'], environment: 'node', fileParallelism: false } });
