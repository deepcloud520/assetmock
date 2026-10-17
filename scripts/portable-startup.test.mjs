import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fork, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync, renameSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import net from 'node:net';
import { chromium } from '@playwright/test';
import runtime from './lib/cli.mjs';
const root=process.cwd();
const execute=(script,env,args=[])=>{
  const r=spawnSync(process.execPath,[script,...args],{cwd:root,env,encoding:'utf8',timeout:120000});
  assert.equal(r.status,0,`${r.stdout}\n${r.stderr}\n${r.error??''}`);return r.stdout;
};
const query=(file,sql)=>JSON.parse(runtime.runPythonSync('import sqlite3,json,sys\nc=sqlite3.connect(sys.argv[1]);print(json.dumps(c.execute(sys.argv[2]).fetchall()));c.close()',[file,sql]));
const envFor=dir=>({...process.env,NODE_ENV:'development',DATABASE_URL:`file:${join(dir,'财务 facts.sqlite').replaceAll('\\','/')}`,DATABASE_PATH:join(dir,'game.sqlite'),DATABASE_BACKUP_DIR:join(dir,'backups'),NEXT_DIST_DIR:'.next-startup-test',LLM_API_KEY:'',OPENAI_API_KEY:'',DOUBAO_SEARCH_API_KEY:'',NEXT_TELEMETRY_DISABLED:'1'});
async function freePort(){const server=net.createServer();server.listen(0,'127.0.0.1');await once(server,'listening');const port=server.address().port;await new Promise(r=>server.close(r));return port;}
async function stop(child){if(child.exitCode!==null)return;const closed=once(child,'close');child.send('shutdown');await Promise.race([closed,new Promise((_,reject)=>{const timer=setTimeout(()=>reject(new Error('Shutdown timed out')),30000);timer.unref();})]);}

test('Python fallback candidates and direct Node CLI paths are portable',()=>{
 assert.deepEqual(runtime.pythonCandidates({}).map(x=>[x.command,...x.args]),[['python3'],['python'],['py','-3']]);
 assert.deepEqual(runtime.pythonCandidates({PYTHON_EXECUTABLE:'py.exe'}),[{command:'py.exe',args:['-3']}]);
 for(const name of ['next','tsc','prisma','tsx','vitest']) assert.ok(!runtime.cliArgs(name)[0].includes('.bin'));
 const result=spawnSync(process.execPath,['-e',"require('./scripts/lib/runtime.cjs').pythonCommand()"],{env:{...process.env,PYTHON_EXECUTABLE:join(tmpdir(),'nonexistent-python-test')},encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/未找到可用的 Python 3/);
});

test('fresh start creates schema and demo, serves portfolio and preserves edits on restart',{timeout:180000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'assetmock fresh start ')),env=envFor(dir),file=runtime.databaseFile(env.DATABASE_URL);
 let child;
 try {
  const port=await freePort();let output='';
  child=fork('scripts/paper-dev.mjs',['--port',String(port)],{cwd:root,env,stdio:['ignore','pipe','pipe','ipc']});
  child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);
  const base=`http://127.0.0.1:${port}`,deadline=Date.now()+100000;let boot;
  while(Date.now()<deadline){if(child.exitCode!==null)throw new Error(output);try{const r=await fetch(`${base}/api/bootstrap`);if(r.ok){boot=await r.json();break;}}catch{}await new Promise(r=>setTimeout(r,400));}
  assert.ok(boot?.demoWorkspaceId?.startsWith('demo-'),output);
  const r=await fetch(`${base}/api/portfolio`,{headers:{'X-Workspace-Id':boot.demoWorkspaceId}});assert.equal(r.status,200,await r.clone().text());
  const portfolio=await r.json();assert.equal(portfolio.assets.length,3);assert.equal(portfolio.goals.length,2);
  assert.equal((await fetch(base)).status,200);
  const browser=await chromium.launch();
  try {
    const page=await browser.newPage();await page.goto(base);
    await page.getByText('演示数据 · 非真实财务／行情',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('financial_associate_workspace_id')),boot.demoWorkspaceId);
    await page.getByRole('button',{name:'进入个人空间',exact:true}).click();
    await page.getByRole('button',{name:'进入独立演示空间',exact:true}).waitFor();
    const personal=await page.evaluate(()=>localStorage.getItem('financial_associate_workspace_id'));
    assert.ok(personal&&!personal.startsWith('demo-'));await page.reload();
    await page.getByText('你的财富概览',{exact:true}).waitFor();
    assert.equal(await page.evaluate(()=>localStorage.getItem('financial_associate_workspace_id')),personal);
  } finally {await browser.close();}

  assert.ok(readdirSync(join(dir,'backups')).some(n=>n.endsWith('.sqlite')),'daily backup completed');
  renameSync(join(dir,'backups'),join(dir,'saved-backups'));writeFileSync(join(dir,'backups'),'simulate unavailable backup directory');
  const readable=await fetch(`${base}/api/portfolio`,{headers:{'X-Workspace-Id':boot.demoWorkspaceId}});
  assert.equal(readable.status,200);assert.match((await readable.json()).backupWarning,/自动备份未完成/);
  rmSync(join(dir,'backups'));renameSync(join(dir,'saved-backups'),join(dir,'backups'));

  assert.equal(query(file,"select count(*) from PaperWorkerLease where status='RUNNING'")[0][0],2,'both workers started');
  await stop(child);child=null;
  const before=query(file,'select id,currentValueMinor from Asset order by id');
  runtime.runPythonSync("import sqlite3,sys\nc=sqlite3.connect(sys.argv[1]);c.execute('update Asset set currentValueMinor=currentValueMinor+123 where id=?',(sys.argv[2],));c.commit();c.close()",[file,before[0][0]]);
  const edited=query(file,'select id,currentValueMinor from Asset order by id');
  execute('scripts/setup.mjs',env);
  assert.deepEqual(query(file,'select id,currentValueMinor from Asset order by id'),edited);
  assert.equal(query(file,'select count(*) from Workspace')[0][0],2,'no duplicate seed or personal space');
  assert.equal(query(file,'select count(*) from PaperAccount')[0][0],2,'no duplicate replay accounts');
  assert.equal(query(file,'select count(*) from _prisma_migrations where finished_at is not null')[0][0],readdirSync('prisma/migrations',{withFileTypes:true}).filter(x=>x.isDirectory()).length);
 } finally {if(child)await stop(child);rmSync(dir,{recursive:true,force:true});}
});

test('pending migration backs up existing facts and never resets an unknown database',{timeout:120000},()=>{
 const dir=mkdtempSync(join(tmpdir(),'assetmock upgrade ')),env=envFor(dir),file=runtime.databaseFile(env.DATABASE_URL);
 try{
  writeFileSync(file,'');
  const folders=readdirSync('prisma/migrations',{withFileTypes:true}).filter(x=>x.isDirectory()).map(x=>x.name).sort();
  const applied=folders.slice(0,-1);
  const payload=join(dir,'history.json');writeFileSync(payload,JSON.stringify(applied.map(name=>({name,sql:readFileSync(join('prisma/migrations',name,'migration.sql'),'utf8')}))));
  runtime.runPythonSync(`import sqlite3,json,sys,hashlib,uuid\nc=sqlite3.connect(sys.argv[1]);c.execute('CREATE TABLE _prisma_migrations (id TEXT PRIMARY KEY,checksum TEXT NOT NULL,finished_at DATETIME,migration_name TEXT NOT NULL,logs TEXT,rolled_back_at DATETIME,started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,applied_steps_count INTEGER NOT NULL DEFAULT 0)')\nfor m in json.load(open(sys.argv[2],encoding='utf8')):\n c.executescript(m['sql']);c.execute('INSERT INTO _prisma_migrations(id,checksum,finished_at,migration_name,applied_steps_count) VALUES(?,?,CURRENT_TIMESTAMP,?,1)',(str(uuid.uuid4()),hashlib.sha256(m['sql'].encode()).hexdigest(),m['name']));c.commit()\nc.execute("INSERT INTO Workspace(id,updatedAt) VALUES('existing',CURRENT_TIMESTAMP)");c.commit();c.close()`,[file,payload]);
  execute('scripts/database-init.mjs',env);
  assert.equal(query(file,"select count(*) from Workspace where id='existing'")[0][0],1);
  const manifests=readdirSync(join(dir,'backups')).filter(n=>n.endsWith('.json'));
  assert.equal(manifests.length,1);const manifest=JSON.parse(readFileSync(join(dir,'backups',manifests[0]),'utf8'));
  assert.equal(manifest.kind,'MIGRATION');assert.equal(query(join(dir,'backups',`${manifest.id}.sqlite`),'select count(*) from _prisma_migrations')[0][0],applied.length);
  const unknown=join(dir,'unknown.sqlite');runtime.runPythonSync('import sqlite3,sys\nc=sqlite3.connect(sys.argv[1]);c.execute("create table keep_me(value integer)");c.execute("insert into keep_me values(42)");c.commit();c.close()',[unknown]);
  const failed=spawnSync(process.execPath,['scripts/database-init.mjs'],{env:{...env,DATABASE_URL:`file:${unknown}`},encoding:'utf8'});
  assert.notEqual(failed.status,0);assert.match(failed.stderr,/未登记迁移历史/);assert.deepEqual(query(unknown,'select * from keep_me'),[[42]]);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
