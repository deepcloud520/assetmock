/* eslint-disable @typescript-eslint/no-require-imports -- Shared by Node launchers and compiled workers. */
const { spawnSync, execFile, execFileSync } = require('node:child_process');
const { promisify } = require('node:util');
const path = require('node:path');
const execute = promisify(execFile);
let selectedPython;

function pythonCandidates(env = process.env) {
  if (env.PYTHON_EXECUTABLE) {
    const command = env.PYTHON_EXECUTABLE;
    return [{ command, args: /^py(?:\.exe)?$/i.test(path.basename(command)) ? ['-3'] : [] }];
  }
  return [{ command: 'python3', args: [] }, { command: 'python', args: [] }, { command: 'py', args: ['-3'] }];
}
function pythonCommand() {
  if (selectedPython) return selectedPython;
  for (const candidate of pythonCandidates()) {
    const check = spawnSync(candidate.command, [...candidate.args, '-c', 'import sys,sqlite3; assert sys.version_info >= (3,8); print("ready")'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
    if (!check.error && check.status === 0 && check.stdout.trim() === 'ready') return selectedPython = candidate;
  }
  throw new Error('未找到可用的 Python 3（需要 sqlite3 模块）。请安装 Python 3 并加入 PATH，重新打开终端；支持 python3、python、py -3，也可在 .env.local 设置 PYTHON_EXECUTABLE 为解释器完整路径。');
}
function runPythonSync(code, args = [], options = {}) {
  const p = pythonCommand();
  return execFileSync(p.command, [...p.args, '-c', code, ...args], { encoding: 'utf8', windowsHide: true, ...options });
}
async function runPython(code, args = []) {
  const p = pythonCommand();
  return execute(p.command, [...p.args, '-c', code, ...args], { encoding: 'utf8', windowsHide: true, maxBuffer: 8 * 1024 * 1024 });
}
function databaseFile(url = process.env.DATABASE_URL || 'file:./financial-associates.db') {
  if (!url.startsWith('file:')) throw new Error('本机版本仅支持 SQLite DATABASE_URL（file:...）。');
  const raw = url.slice(5).split('?')[0];
  if (!raw) throw new Error('DATABASE_URL 缺少数据库文件路径。');
  return path.isAbsolute(raw) ? raw : path.resolve('prisma', raw);
}
module.exports = { pythonCandidates, pythonCommand, runPython, runPythonSync, databaseFile };
