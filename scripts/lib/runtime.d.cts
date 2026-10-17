import type { ExecFileSyncOptionsWithStringEncoding } from 'node:child_process';
export function pythonCandidates(env?: NodeJS.ProcessEnv): {command:string;args:string[]}[];
export function pythonCommand(): {command:string;args:string[]};
export function runPythonSync(code:string,args?:string[],options?:Partial<ExecFileSyncOptionsWithStringEncoding>): string;
export function runPython(code:string,args?:string[]): Promise<{stdout:string;stderr:string}>;
export function databaseFile(url?:string): string;
