import { mkdirSync, openSync, closeSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import runtime from './cli.mjs';
import { acquireLock, ownerIsRunning } from './startup-lock.mjs';
const inspectCode = `import sqlite3,json,sys,pathlib
c=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True)
assert c.execute('pragma integrity_check').fetchone()[0]=='ok','数据库完整性检查失败'
assert not c.execute('pragma foreign_key_check').fetchall(),'数据库外键检查失败'
tables=[x[0] for x in c.execute("select name from sqlite_master where type='table' and name not like 'sqlite_%'")]
rows=c.execute('select migration_name,finished_at,rolled_back_at,checksum from _prisma_migrations').fetchall() if '_prisma_migrations' in tables else []
print(json.dumps({'tables':tables,'migrations':rows}))
c.close()`;
export function initializeDatabase() {
  runtime.pythonCommand();
  const file = runtime.databaseFile();
  const running = ownerIsRunning(`${file}.app-lock`);
  if (running && running !== process.pid) throw new Error('请先停止使用此数据库的 Web 与 worker，再执行迁移。');
  const unlock = acquireLock(`${file}.init-lock`);
  try {
    mkdirSync(dirname(file), {recursive:true});
    try { closeSync(openSync(file,'wx',0o600)); } catch(e) { if(e.code !== 'EEXIST') throw e; }
    const current = JSON.parse(runtime.runPythonSync(inspectCode,[file]));
    if (current.tables.length && !current.tables.includes('_prisma_migrations')) throw new Error('发现已有但未登记迁移历史的数据库，已停止；不会重置或覆盖，请先核对数据库来源。');
    if (current.migrations.some(r=>!r[1]&&!r[2])) throw new Error('数据库存在失败的迁移，已停止；请保留备份并修复迁移，不要重置数据库。');
    const migrations = readdirSync(resolve('prisma/migrations'),{withFileTypes:true}).filter(d=>d.isDirectory()).map(d=>d.name).sort();
    const applied = current.migrations.filter(r=>r[1]&&!r[2]);
    for (const row of applied) {
      if (!migrations.includes(row[0])) throw new Error(`数据库版本比当前代码新或历史不匹配：${row[0]}。请更新代码，不要重置数据库。`);
      const source=readFileSync(resolve('prisma/migrations',row[0],'migration.sql'),'utf8');
      const variants=[source,source.replaceAll('\r\n','\n'),source.replace(/\r?\n/g,'\r\n')];
      if(!variants.some(s=>createHash('sha256').update(s).digest('hex')===row[3])) throw new Error(`已执行迁移文件发生变化：${row[0]}。请恢复原迁移文件后重试。`);
    }
    const pending = migrations.filter(name=>!applied.some(r=>r[0]===name));
    if (!pending.length) { console.log('数据库结构已就绪，无需迁移。'); return; }
    if (current.tables.some(t=>t!=='_prisma_migrations')) {
      const dir=resolve(process.env.DATABASE_BACKUP_DIR || '.local-data/backups');mkdirSync(dir,{recursive:true});
      const id=randomUUID(), target=join(dir,`${id}.sqlite`);
      runtime.runPythonSync(`import sqlite3,sys,pathlib\ns=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True)\nd=sqlite3.connect(sys.argv[2]);s.backup(d);d.close();s.close()`,[file,target]);
      runtime.runPythonSync(inspectCode,[target]);
      const now=new Date().toISOString();writeFileSync(join(dir,`${id}.json`),JSON.stringify({id,kind:'MIGRATION',createdAt:now,date:now.slice(0,10),hash:createHash('sha256').update(readFileSync(target)).digest('hex'),schemaVersion:applied.at(-1)?.[0]??''}),{mode:0o600});
      console.log(`迁移前备份已保存：${target}`);
    }
    console.log(`正在应用 ${pending.length} 项数据库迁移…`);
    runtime.runCli('prisma',['migrate','deploy']);
    runtime.runPythonSync(inspectCode,[file]);
    console.log('数据库初始化完成。');
  } finally { unlock(); }
}
