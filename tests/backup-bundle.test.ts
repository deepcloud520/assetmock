import {it,expect} from 'vitest';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import Database from 'better-sqlite3';
it('offline bundle restores product and game together after preserving current stores',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bundle-test-'));const p=join(dir,'p.sqlite'),g=join(dir,'g.sqlite');
 try{for(const file of [p,g]){const db=new Database(file);db.exec('CREATE TABLE facts(value INTEGER); INSERT INTO facts VALUES(1)');db.close();}
 const env={...process.env,DATABASE_URL:`file:${p}`,DATABASE_PATH:g,BUNDLE_BACKUP_DIR:join(dir,'bundles')};
 const bundle=execFileSync(process.execPath,['scripts/backup-all.mjs','--stopped'],{env,encoding:'utf8'}).trim().split('\n').at(-1)!;
 for(const file of [p,g]){const db=new Database(file);db.exec('UPDATE facts SET value=2');db.close();}
 execFileSync(process.execPath,['scripts/backup-all.mjs','--stopped','--restore',bundle],{env});
 for(const file of [p,g]){const db=new Database(file);expect(db.prepare('SELECT value FROM facts').get()).toEqual({value:1});db.close();}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
