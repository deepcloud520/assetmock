// Run only after stopping Web and both workers. All paths stay local; no network calls.
import runtime from './lib/cli.mjs';
import {existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {createHash} from 'node:crypto';
runtime.loadEnvironment();
if(!process.argv.includes('--stopped'))throw new Error('先停止 Web 与两个 worker，再添加 --stopped。');
const files={product:runtime.databaseFile(),game:resolve(process.env.DATABASE_PATH)};
const restoreAt=process.argv.indexOf('--restore');
const destination=restoreAt>=0?resolve(process.argv[restoreAt+1]):resolve(process.env.BUNDLE_BACKUP_DIR??'.local-data/bundles',new Date().toISOString().replace(/[:.]/g,'-'));
const hash=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
function copy(from,to){mkdirSync(resolve(to,'..'),{recursive:true});runtime.runPythonSync("import sqlite3,sys,pathlib\ns=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True)\nassert s.execute('pragma integrity_check').fetchone()[0]=='ok'\nd=sqlite3.connect(sys.argv[2]);s.backup(d);d.close();s.close()",[from,to]);}
if(restoreAt<0){mkdirSync(destination,{recursive:true});const manifest={version:1,createdAt:new Date().toISOString(),files:{}};for(const [kind,path] of Object.entries(files)){if(!existsSync(path))continue;const target=join(destination,`${kind}.sqlite`);copy(path,target);manifest.files[kind]={name:`${kind}.sqlite`,sha256:hash(target)};}writeFileSync(join(destination,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});console.log(destination);}
else{
 const manifest=JSON.parse(readFileSync(join(destination,'manifest.json'),'utf8'));if(manifest.version!==1)throw new Error('Unsupported bundle version');
 for(const [kind,entry] of Object.entries(manifest.files)){if(!files[kind]||entry.name!==`${kind}.sqlite`||hash(join(destination,entry.name))!==entry.sha256)throw new Error('Backup verification failed');}
 // Preserve current state before any replacement; a restore is never an unbacked overwrite.
 const rescue=resolve(process.env.BUNDLE_BACKUP_DIR??'.local-data/bundles',`before-restore-${Date.now()}`);
 for(const [kind,path] of Object.entries(files))if(existsSync(path))copy(path,join(rescue,`${kind}.sqlite`));
 for(const [kind,entry] of Object.entries(manifest.files))copy(join(destination,entry.name),files[kind]);
 console.log('Restored both available stores. Previous copies:',rescue);
}
