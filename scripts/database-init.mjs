import {createRequire} from 'node:module';
import {mkdirSync,openSync,closeSync} from 'node:fs';
import {resolve,isAbsolute,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
createRequire(import.meta.url)('@next/env').loadEnvConfig(process.cwd());
const url=process.env.DATABASE_URL??'file:./financial-associates.db';
if(!url.startsWith('file:'))throw new Error('This local deployment requires SQLite');
const raw=url.slice(5),file=isAbsolute(raw)?raw:resolve('prisma',raw);mkdirSync(dirname(file),{recursive:true});
try{closeSync(openSync(file,'wx',0o600));}catch(e){if(e.code!=='EEXIST')throw e;}
const result=spawnSync(resolve('node_modules/.bin/prisma'),['migrate','deploy'],{stdio:'inherit',env:{...process.env,DATABASE_URL:`file:${file}`}});process.exit(result.status??1);
