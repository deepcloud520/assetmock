import runtime from './lib/cli.mjs';
import { prepareApplication } from './lib/setup.mjs';
import { acquireLock } from './lib/startup-lock.mjs';
let unlock;
try {
  runtime.loadEnvironment();runtime.pythonCommand();
  unlock=acquireLock(`${runtime.databaseFile()}.app-lock`);
  prepareApplication();
} catch(error) { console.error(`初始化失败：${error.message}`);process.exitCode=1; }
finally { unlock?.(); }
