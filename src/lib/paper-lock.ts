import { open, readFile, unlink, mkdir } from "node:fs/promises";
import { AsyncLocalStorage } from "node:async_hooks";
import path from "node:path";
import { randomUUID } from "node:crypto";

const context = new AsyncLocalStorage<boolean>();
export function paperLockPath() {
  const raw = (process.env.DATABASE_URL ?? "file:./dev.db").replace(/^file:/, "").split("?")[0];
  return (path.isAbsolute(raw) ? raw : path.resolve("prisma", raw)) + ".paper-lock";
}
// Shared by all trading writes and destructive maintenance. No time-based lock stealing:
// a slow but live process must retain exclusion. Recovery only after the owner exits.
export async function withPaperLock<T>(work: () => Promise<T>): Promise<T> {
  if (context.getStore()) return work();
  const file = paperLockPath(), token = randomUUID();
  await mkdir(path.dirname(file), { recursive: true });
  const deadline = Date.now() + 8000;
  for (;;) {
    try { const handle = await open(file, "wx", 0o600); await handle.writeFile(JSON.stringify({ pid: process.pid, token })); await handle.close(); break; }
    catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
      try {
        const owner = JSON.parse(await readFile(file, "utf8"));
        try { process.kill(owner.pid, 0); } catch (err) { if ((err as NodeJS.ErrnoException).code === "ESRCH") await unlink(file); }
      } catch { /* Newly created lock may not yet contain its owner. */ }
      if (Date.now() >= deadline) throw new Error("交易或数据维护正在进行，请稍后重试");
      await new Promise(resolve => setTimeout(resolve, 30));
    }
  }
  try { return await context.run(true, work); }
  finally { const owner = JSON.parse(await readFile(file, "utf8")); if (owner.token === token) await unlink(file); }
}
