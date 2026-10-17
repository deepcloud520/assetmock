import { defineConfig, globalIgnores } from 'eslint/config';
import next from 'eslint-config-next/core-web-vitals';
import ts from 'eslint-config-next/typescript';
import sonarjs from 'eslint-plugin-sonarjs';
export default defineConfig([
  ...next, ...ts,
  { plugins: { sonarjs }, rules: {
    'sonarjs/cognitive-complexity': ['warn', 25],
    'sonarjs/no-identical-expressions': 'error',
    'sonarjs/no-duplicated-branches': 'error'
  } },
  globalIgnores(['.next/**', '.local-data/**', 'coverage/**', 'playwright-report/**', 'test-results/**', 'next-env.d.ts'])
]);
