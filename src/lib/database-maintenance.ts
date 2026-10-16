import { AsyncLocalStorage } from "node:async_hooks";
import { withPaperLock } from "./paper-lock";
const globals = globalThis as unknown as { databaseMaintenance?: { locked: boolean; inFlightModels: number; context: AsyncLocalStorage<boolean> } };
export const databaseMaintenance = globals.databaseMaintenance ??= { locked: false, inFlightModels: 0, context: new AsyncLocalStorage<boolean>() };
export function assertDatabaseAvailable() { if (databaseMaintenance.locked && !databaseMaintenance.context.getStore()) throw new Error("数据库维护中，请稍后重试"); }
export async function exclusively<T>(work: () => Promise<T>): Promise<T> { if (databaseMaintenance.locked) throw new Error("数据库正在维护"); if (databaseMaintenance.inFlightModels > 0) throw new Error("仍有AI处理正在进行，请等待结束后再执行删除或恢复。"); databaseMaintenance.locked = true; try { return await withPaperLock(() => databaseMaintenance.context.run(true, work)); } finally { databaseMaintenance.locked = false; } }

export async function modelFetch(input: string, init: RequestInit): Promise<Response> {
  assertDatabaseAvailable(); databaseMaintenance.inFlightModels += 1;
  try { const response = await fetch(input, init); const body = await response.text(); return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers }); }
  finally { databaseMaintenance.inFlightModels -= 1; }
}
