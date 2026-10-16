import { afterEach, describe, expect, it, vi } from "vitest";
import { db } from "./db";
import { exclusively, modelFetch } from "./database-maintenance";
afterEach(() => vi.restoreAllMocks());
describe("model calls and maintenance boundaries", () => {
  it("slow AI does not hold a SQLite write transaction, while deletion waits for it to end", async () => {
    let release!: (r: Response) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((resolve) => { release = resolve; })));
    const pending = modelFetch("https://example.test", { method: "POST" });
    try { await expect(exclusively(async () => true)).rejects.toThrow("AI处理"); const w = await db.workspace.create({ data: {} }); await db.workspace.delete({ where: { id: w.id } }); }
    finally { release(new Response('{"ok":true}')); await pending; }
    expect(await exclusively(async () => true)).toBe(true); vi.unstubAllGlobals();
  });
  it("failed external calls release the maintenance barrier", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(modelFetch("https://example.test", {})).rejects.toThrow("offline");
    expect(await exclusively(async () => true)).toBe(true); vi.unstubAllGlobals();
  });
});
