import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPythonSync } from "../../../scripts/lib/runtime.cjs";
import { createAccount } from "./service";

let dir: string, db: PrismaClient, workspaceId: string, market: typeof import("./market"), fetchMock: ReturnType<typeof vi.fn>;
const oldURL = process.env.DATABASE_URL;
const quoteAt = new Date("2026-10-08T01:31:00Z");
function tencent(symbol = "sh600000") {
  const fields = Array.from({ length: 50 }, () => "0");
  fields[1] = "Synthetic Test Only"; fields[2] = symbol.slice(2); fields[3] = "10.00"; fields[4] = "10.00";
  fields[9] = "10.00"; fields[10] = "2"; fields[19] = "10.00"; fields[20] = "3";
  fields[30] = "20261008093100"; fields[47] = "11.00"; fields[48] = "9.00";
  return `v_${symbol}="${fields.join("~")}";`;
}
function response(body = tencent(), status = 200) { return new Response(body, { status }); }
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "paper-market-test-")); const file = join(dir, "test.sqlite"); process.env.DATABASE_URL = `file:${file}`;
  const migrations = (await readdir("prisma/migrations")).filter(x => /^\d/.test(x)).sort();
  const sql = (await Promise.all(migrations.map(m => readFile(`prisma/migrations/${m}/migration.sql`, "utf8")))).join("\n");
  runPythonSync("import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.executescript(sys.stdin.read());c.close()", [file], { input: sql });
  db = new PrismaClient({ datasourceUrl: `file:${file}` }); workspaceId = (await db.workspace.create({ data: {} })).id;
}, 20000);
beforeEach(async () => {
  // Reload only the market adapter to isolate its in-memory source cooldowns.
  vi.resetModules(); market = await import("./market"); fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);
  await db.marketQuote.deleteMany();
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
afterAll(async () => { await db?.$disconnect(); if (dir) await rm(dir, { recursive: true, force: true }); if (oldURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = oldURL; });
describe("isolated market source failures and transaction boundaries", () => {
  it("backs off a failed offline request and retries only after its cooldown", async () => {
    let clock = quoteAt.getTime(); vi.spyOn(Date, "now").mockImplementation(() => clock);
    fetchMock.mockRejectedValueOnce(new TypeError("synthetic offline")).mockResolvedValueOnce(response());
    await expect(market.fetchQuotes(["sh600000"])).rejects.toThrow("offline");
    await expect(market.fetchQuotes(["sh600000"])).rejects.toThrow("退避"); expect(fetchMock).toHaveBeenCalledTimes(1);
    clock += 5001; expect(await market.fetchQuotes(["sh600000"])).toHaveLength(1); expect(fetchMock).toHaveBeenCalledTimes(2);
  });
  it("passes a bounded timeout signal and preserves a timeout rejection without writing quotes", async () => {
    const signal = AbortSignal.abort(new DOMException("synthetic timeout", "TimeoutError")); const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(signal);
    fetchMock.mockImplementation((_url: string, init: RequestInit) => Promise.reject(init.signal?.reason));
    await expect(market.refreshQuotes(db, ["sh600000"])).rejects.toThrow("timeout"); expect(timeout).toHaveBeenCalledWith(6000);
    expect(await db.marketQuote.count()).toBe(0);
  });
  it("rejects HTTP failures and records a source failure rather than a fresh quote", async () => {
    fetchMock.mockResolvedValue(response("synthetic service unavailable", 503));
    await expect(market.refreshQuotes(db, ["sh600000"])).rejects.toThrow("503"); expect(await db.marketQuote.count()).toBe(0);
    const source = await db.marketSourceHealth.findUniqueOrThrow({ where: { provider: "TENCENT" } }); expect(source.failureCount).toBeGreaterThan(0); expect(source.error).toContain("503");
  });
  it("does not fabricate missing quotes from empty or partial responses", async () => {
    fetchMock.mockResolvedValueOnce(response("")).mockResolvedValueOnce(response(tencent()));
    await expect(market.refreshQuotes(db, ["sh600000", "sz000001"])).rejects.toThrow("来源报价不完整");
    expect(await db.marketQuote.count()).toBe(0);
    await expect(market.refreshQuotes(db, ["sh600000", "sz000001"])).rejects.toThrow("sz000001");
    expect(await db.marketQuote.count({ where: { instrumentId: "sh600000" } })).toBe(1);
    expect(await db.marketQuote.count({ where: { instrumentId: "sz000001" } })).toBe(0);
  });
  it("preserves immutable original fetchedAt and does not create fresh liquidity for the same payload", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(response()));
    await market.refreshQuotes(db, ["sh600000"]); const first = await db.marketQuote.findFirstOrThrow({ where: { instrumentId: "sh600000" } });
    await market.refreshQuotes(db, ["sh600000"]); const last = await db.marketQuote.findFirstOrThrow({ where: { instrumentId: "sh600000" } });
    expect(last.id).toBe(first.id); expect(last.fetchedAt).toEqual(first.fetchedAt); expect(last.sourceAt).toEqual(quoteAt); expect(await db.marketQuote.count()).toBe(1);
  });
  it("allows a short ledger write while the network source is still waiting", async () => {
    let release!: (value: Response) => void, entered!: () => void;
    const waiting = new Promise<Response>(resolve => { release = resolve; }), networkEntered = new Promise<void>(resolve => { entered = resolve; });
    fetchMock.mockImplementation(() => { entered(); return waiting; });
    const refresh = market.refreshQuotes(db, ["sh600000"]); await networkEntered;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const writing = createAccount(db, workspaceId, quoteAt);
      const a = await Promise.race([writing, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("network held ledger write lock")), 1500); })]);
      expect(a.cashMinor).toBe(10_000_000n); expect(await db.paperCashEntry.count({ where: { accountId: a.id } })).toBe(1);
    } finally { if (timer) clearTimeout(timer); release(response()); }
    await refresh; expect(await db.marketQuote.count()).toBe(1); expect(await db.asset.count({ where: { workspaceId } })).toBe(0);
  });
});
