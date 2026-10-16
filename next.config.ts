import type { NextConfig } from 'next';
const config: NextConfig = { output: 'standalone', distDir: process.env.NEXT_DIST_DIR || '.next', serverExternalPackages: ['better-sqlite3'], turbopack: { root: process.cwd() } };
export default config;
