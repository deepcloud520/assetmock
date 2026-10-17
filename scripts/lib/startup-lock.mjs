import { openSync, readFileSync, writeFileSync, closeSync, unlinkSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
export function ownerIsRunning(file) {
  let owner;
  try { owner = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { if (e.code === 'ENOENT') return false; throw new Error(`无法读取启动锁 ${file}，请确认其他实例已停止后检查该文件。`); }
  if (!Number.isInteger(owner.pid) || owner.pid <= 0) throw new Error(`启动锁无效：${file}`);
  try { process.kill(owner.pid, 0); return owner.pid; } catch (e) { if (e.code === 'ESRCH') return false; return owner.pid; }
}
export function acquireLock(file) {
  mkdirSync(dirname(file), {recursive:true});
  const token = randomUUID();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fd = openSync(file, 'wx', 0o600);
      try { writeFileSync(fd, JSON.stringify({pid:process.pid,token})); } finally { closeSync(fd); }
      return () => { try { if (JSON.parse(readFileSync(file,'utf8')).token === token) unlinkSync(file); } catch (e) { if(e.code !== 'ENOENT') throw e; } };
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      if (ownerIsRunning(file)) throw new Error('同一数据库已有实例或初始化进程运行，请先停止它再启动。');
      unlinkSync(file);
    }
  }
  throw new Error('无法获取启动锁，请稍后重试。');
}
