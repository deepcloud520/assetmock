import {spawnSync,spawn} from 'node:child_process';
import {mkdirSync,writeFileSync,rmSync} from 'node:fs';
import {resolve} from 'node:path';
const dir=resolve('.local-data/e2e');rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true});writeFileSync(`${dir}/financial.db`,'');
const env={...process.env,DATABASE_URL:`file:${dir}/financial.db`,DATABASE_PATH:`${dir}/game.sqlite`,DATABASE_BACKUP_DIR:`${dir}/backups`,NEXT_DIST_DIR:'.next-e2e',LLM_API_KEY:'',OPENAI_API_KEY:'',DOUBAO_SEARCH_API_KEY:''};
if(spawnSync(resolve('node_modules/.bin/prisma'),['migrate','deploy'],{env,stdio:'inherit'}).status!==0)process.exit(1);
const child=spawn(resolve('node_modules/.bin/next'),['dev','--hostname','127.0.0.1','--port','3100'],{env,stdio:'inherit'});
process.on('SIGTERM',()=>child.kill('SIGTERM'));process.on('SIGINT',()=>child.kill('SIGINT'));child.on('exit',c=>process.exit(c??0));
