import { existsSync, copyFileSync, constants, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createRequire } from 'node:module';
import runtime from './cli.mjs';
import { initializeDatabase } from './initialize-database.mjs';
const require=createRequire(import.meta.url);
export function prepareApplication() {
  const envFiles = ['.env', '.env.local', '.env.development', '.env.development.local', '.env.production', '.env.production.local'];
  if (!envFiles.some(file => existsSync(file)) && process.env.NODE_ENV !== 'test') {
    try { copyFileSync('.env.example','.env.local',constants.COPYFILE_EXCL); console.log('已创建 .env.local 模板；可稍后填写 API Key，手动功能不需要密钥。'); } catch(e) { if(e.code!=='EEXIST') throw e; }
  }
  runtime.loadEnvironment();
  const python=runtime.pythonCommand();console.log(`Python 3 检查通过：${python.command} ${python.args.join(' ')}`);
  runtime.runCli('prisma',['generate']);
  initializeDatabase();
  mkdirSync(dirname(process.env.DATABASE_PATH),{recursive:true});
  // Ensure the native game database module can load before starting any services.
  require('better-sqlite3');
  const seeded=runtime.runCli('tsx',['scripts/seed-demo.ts'],{encoding:'utf8',stdio:['ignore','pipe','inherit']});
  const demo=JSON.parse(seeded.stdout.trim().split('\n').at(-1));
  process.env.STARTER_DEMO_WORKSPACE_ID=demo.id;
  console.log(demo.created?'独立演示空间已建立。':'已保留原数据并复用独立演示空间。');
}
