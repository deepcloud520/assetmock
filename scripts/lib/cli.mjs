import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import core from './runtime.cjs';
const require=createRequire(import.meta.url);
function loadEnvironment(production = process.env.NODE_ENV === 'production') {
  require('@next/env').loadEnvConfig(process.cwd(), !production);
  process.env.DATABASE_URL = `file:${core.databaseFile().replaceAll('\\', '/')}`;
  process.env.DATABASE_PATH = path.resolve(process.env.DATABASE_PATH || './data/life-simulator.sqlite');
}
const cliModules = { prisma: 'prisma/build/index.js', next: 'next/dist/bin/next', tsc: 'typescript/bin/tsc', tsx: 'tsx/cli' };
function cliArgs(name,args=[]) {
  if(name==='vitest')return [path.join(path.dirname(require.resolve('vitest/package.json')),'vitest.mjs'),...args];
  if(!cliModules[name])throw new Error(`Unknown project CLI: ${name}`);
  return [require.resolve(cliModules[name]),...args];
}
function runCli(name,args=[],options={}) {
  const result=spawnSync(process.execPath,cliArgs(name,args),{stdio:'inherit',...options});
  if(result.error)throw new Error(`${name} 无法启动：${result.error.message}`);
  if(result.status!==0)throw new Error(`${name} 执行失败（退出码 ${result.status??result.signal}），请查看上方错误。`);
  return result;
}
const cli = {...core,loadEnvironment,cliArgs,runCli};
export default cli;
