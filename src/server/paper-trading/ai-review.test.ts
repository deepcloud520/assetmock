import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PrismaClient } from "@prisma/client";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { runPythonSync } from "../../../scripts/lib/runtime.cjs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createAccount, transaction } from "./service";
import { generatePaperReview } from "./ai-review";

let db: PrismaClient, dir: string;
const priorURL = process.env.DATABASE_URL;
const start = new Date("2026-10-08T02:00:00Z");
type ReviewInput = { evidenceIds: string[]; insights: { cashMinor: string; accountVersion: number; maxDrawdownBps: number | null; period: { feeToTurnoverBps: number | null } }; records: { records: unknown[] }; notes: { records: unknown[] }; displayValues: { account: { cash: string; initialCapital: string; return: string }; risk: { maxDrawdown: string }; period: { feeToTurnover: string }; benchmark: string | object } };
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "paper-ai-review-")); const file = join(dir, "test.sqlite"); process.env.DATABASE_URL = `file:${file}`;
  const migrations = (await readdir("prisma/migrations")).filter(x => /^\d/.test(x)).sort();
  const sql = (await Promise.all(migrations.map(m => readFile(`prisma/migrations/${m}/migration.sql`, "utf8")))).join("\n");
  runPythonSync("import sqlite3,sys;c=sqlite3.connect(sys.argv[1]);c.executescript(sys.stdin.read());c.close()", [file], { input: sql });
  db = new PrismaClient({ datasourceUrl: `file:${file}` });
}, 20000);
afterAll(async () => { await db?.$disconnect(); if (dir) await rm(dir, { recursive: true, force: true }); if (priorURL === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = priorURL; });
async function seed() {
  const workspaceId = (await db.workspace.create({ data: {} })).id;
  const accountId = (await createAccount(db, workspaceId, start)).id;
  return { workspaceId, accountId };
}
function reply(raw: unknown) {
  const input = raw as ReviewInput;
  return { message: `现金为 ${input.displayValues.account.cash}；依据 ${input.evidenceIds[0]}，尚无成交记录。`, evidenceIds: [input.evidenceIds[0]] };
}
async function ledger(accountId: string) {
  const a = await db.paperAccount.findUniqueOrThrow({ where: { id: accountId } });
  return { cashMinor: a.cashMinor, frozenMinor: a.frozenMinor, realizedMinor: a.realizedMinor, feesMinor: a.feesMinor, entries: await db.paperCashEntry.findMany({ where: { accountId } }), orders: await db.paperOrder.findMany({ where: { accountId } }), positions: await db.paperPosition.findMany({ where: { accountId } }) };
}

describe("readonly AI paper review", () => {
  it("uses program evidence and releases the write transaction before model invocation", async () => {
    const x = await seed(), before = await ledger(x.accountId), key = randomUUID();
    const result = await generatePaperReview(db, x.workspaceId, { accountId: x.accountId, key }, async (_prompt, raw) => {
      const input = raw as ReviewInput;
      expect(input.insights.cashMinor).toBe("10000000");
      expect(input.displayValues.account).toMatchObject({ cash: "100,000.00 元", initialCapital: "100,000.00 元", return: "0.00%" });
      expect(input.insights.maxDrawdownBps).toBeNull();
      expect(input.displayValues.risk.maxDrawdown).toBe("资料不足");
      expect(input.insights.period.feeToTurnoverBps).toBeNull();
      expect(input.displayValues.period.feeToTurnover).toBe("资料不足");
      expect(input.displayValues.benchmark).toBe("资料不足：缺少两个有效账户估值点");
      expect(input.evidenceIds).toContain(x.accountId);
      // A nested transaction would retain the global trading lock or time out.
      await transaction(db, tx => tx.workspace.create({ data: {} }));
      return reply(raw);
    });
    expect(result.message).toContain("100,000.00 元");
    expect(await ledger(x.accountId)).toEqual(before);
    const saved = await db.paperOperationalEvent.findUniqueOrThrow({ where: { id: key } });
    expect(saved.type).toBe("AI_REVIEW");
    const detail = JSON.parse(saved.detailJson);
    expect(detail.result.evidenceIds).toEqual(result.evidenceIds);
    expect(detail.input.insights.accountVersion).toBe(0);
    expect(detail.promptVersion).toBe("paper-review-v1.1");
    expect(detail.input.displayValues.account.cash).toBe("100,000.00 元");
  });
  it("formats integer-fen amounts beyond floating-point precision and uses program drawdown values", async () => {
    const seeded = await seed(), key = randomUUID(), huge = 9_007_199_254_740_993n;
    // Isolated legacy/import boundary fixture: formatting must not round a fen
    // even when the stored integer exceeds JavaScript's safe Number range.
    const a = await db.paperAccount.create({ data: { workspaceId: seeded.workspaceId, status: "ARCHIVED", initialMinor: huge, cashMinor: huge, ruleId: "paper-v1-unverified", createdAt: start } });
    const x = { workspaceId: seeded.workspaceId, accountId: a.id };
    await transaction(db, async tx => {
      await tx.paperCashEntry.create({ data: { ...x, eventKey: `initial:${a.id}`, type: "INITIAL", amountMinor: huge, balanceMinor: huge, reference: "isolated numeric precision fixture", createdAt: start } });
      for (const [index, equity] of [10_000_000n, 9_877_000n].entries()) await tx.paperEquitySnapshot.create({ data: { workspaceId: x.workspaceId, accountId: x.accountId, key: `format-test:${index}`, equityMinor: equity, cashMinor: equity, marketMinor: 0n, quality: "CURRENT", evidenceJson: "[]", createdAt: new Date(start.getTime() + (index + 1) * 60000) } });
    });
    const before = await ledger(x.accountId);
    await generatePaperReview(db, x.workspaceId, { accountId: x.accountId, key }, async (_prompt, raw) => {
      const input = raw as ReviewInput;
      expect(input.insights.cashMinor).toBe(huge.toString());
      expect(input.displayValues.account.cash).toBe("90,071,992,547,409.93 元");
      expect(input.displayValues.account.initialCapital).toBe("90,071,992,547,409.93 元");
      expect(input.insights.maxDrawdownBps).toBe(123);
      expect(input.displayValues.risk.maxDrawdown).toBe("1.23%");
      expect(input.displayValues.period.feeToTurnover).toBe("资料不足");
      return reply(raw);
    });
    expect(await ledger(x.accountId)).toEqual(before);
  });
  it("rejects fabricated evidence without leaving success or pending records", async () => {
    const x = await seed(), before = await ledger(x.accountId), key = randomUUID();
    await expect(generatePaperReview(db, x.workspaceId, { accountId: x.accountId, key }, async () => ({ message: "使用不存在的成交", evidenceIds: ["FILL:invented"] }))).rejects.toThrow("引用无法核对");
    expect(await db.paperOperationalEvent.findUnique({ where: { id: key } })).toBeNull();
    expect(await ledger(x.accountId)).toEqual(before);
  });
  it("rejects a result after the account changes during model generation", async () => {
    const x = await seed(), before = await ledger(x.accountId), key = randomUUID();
    await expect(generatePaperReview(db, x.workspaceId, { accountId: x.accountId, key }, async (_prompt, raw) => {
      await transaction(db, tx => tx.paperAccount.update({ where: { id: x.accountId }, data: { version: { increment: 1 } } }));
      return reply(raw);
    })).rejects.toThrow("账户已变化");
    expect(await db.paperOperationalEvent.findUnique({ where: { id: key } })).toBeNull();
    expect(await ledger(x.accountId)).toEqual(before);
  });
  it("returns the same request without another model call and rejects incompatible keys", async () => {
    const x = await seed(), other = await seed(), key = randomUUID(); let calls = 0;
    const model = async (_prompt: string, raw: unknown) => { calls++; return reply(raw); };
    const first = await generatePaperReview(db, x.workspaceId, { accountId: x.accountId, key }, model);
    expect(await generatePaperReview(db, x.workspaceId, { accountId: x.accountId, key }, model)).toEqual(first);
    await expect(generatePaperReview(db, x.workspaceId, { accountId: x.accountId, key, from: "2026-10-07" }, model)).rejects.toThrow("不同复盘");
    await expect(generatePaperReview(db, other.workspaceId, { accountId: other.accountId, key }, model)).rejects.toThrow("编号不匹配");
    expect(calls).toBe(1);
    expect(await db.paperOperationalEvent.count({ where: { id: key, type: "AI_REVIEW" } })).toBe(1);
  });
  it("does not change the ledger or save fake success when the model fails", async () => {
    const x = await seed(), before = await ledger(x.accountId), key = randomUUID();
    await expect(generatePaperReview(db, x.workspaceId, { accountId: x.accountId, key }, async () => { throw new Error("MODEL_UNAVAILABLE_TEST"); })).rejects.toThrow("MODEL_UNAVAILABLE_TEST");
    expect(await db.paperOperationalEvent.findUnique({ where: { id: key } })).toBeNull();
    expect(await ledger(x.accountId)).toEqual(before);
    expect((await db.paperAccount.findUniqueOrThrow({ where: { id: x.accountId } })).version).toBe(0);
  });
  it("claims a key across concurrent requests without making a second model call", async () => {
    const x = await seed(), key = randomUUID(); let calls = 0;
    let started!: () => void, release!: () => void;
    const modelStarted = new Promise<void>(resolve => { started = resolve; });
    const modelReleased = new Promise<void>(resolve => { release = resolve; });
    const model = async (_prompt: string, raw: unknown) => { calls++; started(); await modelReleased; return reply(raw); };
    const first = generatePaperReview(db, x.workspaceId, { accountId: x.accountId, key }, model);
    await modelStarted;
    try {
      await expect(generatePaperReview(db, x.workspaceId, { accountId: x.accountId, key }, model)).rejects.toThrow("正在生成");
      await expect(generatePaperReview(db, x.workspaceId, { accountId: x.accountId, key, from: "2026-10-07" }, model)).rejects.toThrow("不同复盘");
      expect(calls).toBe(1);
    } finally { release(); }
    const result = await first;
    expect(await generatePaperReview(db, x.workspaceId, { accountId: x.accountId, key }, model)).toEqual(result);
    expect(calls).toBe(1);
  });
  it("takes over only an expired pending claim and rejects unrelated event keys", async () => {
    const x = await seed(), key = randomUUID(), body = { accountId: x.accountId, key };
    await db.paperOperationalEvent.create({ data: { ...x, id: key, type: "AI_REVIEW_PENDING", detailJson: JSON.stringify({ request: body, token: "old-owner", expiresAt: new Date(0).toISOString() }) } });
    const result = await generatePaperReview(db, x.workspaceId, body, async (_prompt, raw) => reply(raw));
    expect(result.evidenceIds).toContain(x.accountId);
    expect((await db.paperOperationalEvent.findUniqueOrThrow({ where: { id: key } })).type).toBe("AI_REVIEW");
    const foreign = randomUUID();
    await db.paperOperationalEvent.create({ data: { ...x, id: foreign, type: "PAUSED", detailJson: "{}" } });
    await expect(generatePaperReview(db, x.workspaceId, { accountId: x.accountId, key: foreign }, async () => { throw new Error("must not call"); })).rejects.toThrow("编号不匹配");
  });
});
