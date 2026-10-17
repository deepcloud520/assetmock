import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import runtime from './lib/cli.mjs';
import { prepareApplication } from './lib/setup.mjs';
import { acquireLock } from './lib/startup-lock.mjs';

const args=process.argv.slice(2),production=args.includes('--production');
if(production) process.env.NODE_ENV='production';
let unlock;
try {
  runtime.loadEnvironment(production);
  runtime.pythonCommand();
  unlock=acquireLock(`${runtime.databaseFile()}.app-lock`);
  prepareApplication();
  for (const field of ['API_KEY','BASE_URL','MODEL']) {
    process.env[`OPENAI_${field}`] ||= process.env[`LLM_${field}`];
    process.env[`LLM_${field}`] ||= process.env[`OPENAI_${field}`];
  }
  const children=[];
  if(!args.includes('--web-only')) {
    runtime.runCli('tsc',['-p','tsconfig.paper-worker.json']);
    for(const name of ['paper-worker','paper-strategy-worker']) children.push({name,child:spawn(process.execPath,['--require',path.resolve('scripts/paper-runtime-alias.cjs'),`.local-data/paper-runtime/scripts/${name}.js`],{stdio:'inherit',env:process.env})});
  }
  if(!args.includes('--worker-only')) children.push({name:'Web',child:spawn(process.execPath,runtime.cliArgs('next',[production?'start':'dev','--hostname','127.0.0.1',...args.filter(a=>!['--production','--web-only'].includes(a))]),{stdio:'inherit',env:process.env})});
  let stopping=false,remaining=children.length;
  const stop=()=>{if(stopping)return;stopping=true;for(const {child} of children){if(process.platform==='win32'&&child.pid)spawnSync(path.join(process.env.SystemRoot || 'C:\\Windows','System32','taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{stdio:'ignore',windowsHide:true});else child.kill('SIGTERM');}};
  process.on('SIGINT',stop);process.on('SIGTERM',stop);
  // Allows the cross-platform smoke test to request a graceful shutdown on Windows.
  process.on('message',message=>{if(message==='shutdown')stop();});
  for(const {name,child} of children) {
    child.on('error',error=>{console.error(`${name} 无法启动：${error.message}`);process.exitCode=1;stop();});
    child.on('close',(code,signal)=>{
      if(!stopping){console.error(`${name} 已退出（${signal??code}），停止其他进程。`);process.exitCode=code||1;stop();}
      if(--remaining===0){unlock();if(process.connected)process.disconnect();}
    });
  }
} catch(error) { console.error(`启动失败：${error.message}`);unlock?.();process.exitCode=1; }
