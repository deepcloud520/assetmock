import runtime from './lib/cli.mjs';
import { initializeDatabase } from './lib/initialize-database.mjs';
try { runtime.loadEnvironment(); initializeDatabase(); }
catch(error) { console.error(error.message); process.exitCode=1; }
