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
 const args=process.argv.slice(2);
 const groups=args.length?[args]:[
 ['src/server/paper-trading'],
 ['tests','src/server/unified-database.test.ts','src/server/five-agent-runtime.test.ts'],
 ['src','--exclude','**/paper-trading/**','--exclude','**/unified-database.test.ts','--exclude','**/five-agent-runtime.test.ts'],
 ['scripts'],
 ];
 status=0;
 for(const group of groups){
   const result=spawnSync(resolve('node_modules/.bin/vitest'),['run',...group],{env,stdio:'inherit',timeout:180000});
   if(result.error||result.status!==0){status=1;console.error('Test group failed or exceeded 180 seconds:',group.join(' '));break;}
 }
} finally { rmSync(dir, { recursive: true, force: true }); }
process.exit(status);
