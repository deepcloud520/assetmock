import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
const dir = mkdtempSync(join(tmpdir(), 'assetmock-test-'));
const file = join(dir, 'financial.db'); writeFileSync(file, '');
const env = { ...process.env, DATABASE_URL: `file:${file}`, DATABASE_PATH: join(dir, 'game.sqlite'), DATABASE_BACKUP_DIR: join(dir, 'backups'), NODE_ENV: 'test' };
let status = 1;
try {
 const migrate = spawnSync(resolve('node_modules/.bin/prisma'), ['migrate', 'deploy'], { env, stdio: 'inherit' });
 if (migrate.status !== 0) throw new Error('Test database migration failed');
 const result = spawnSync(resolve('node_modules/.bin/vitest'), ['run', ...process.argv.slice(2)], { env, stdio: 'inherit' }); status = result.status ?? 1;
} finally { rmSync(dir, { recursive: true, force: true }); }
process.exit(status);
