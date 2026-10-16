import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { File as NodeFile } from "node:buffer";
import { db } from "@/lib/db";
import { commitTransactionImport, extractTransactionsFromImages, extractTransactionsFromText } from "./transaction-import";

describe("transaction batch import", () => {
  let workspaceId = "";

  beforeAll(async () => {
    workspaceId = (await db.workspace.create({ data: {} })).id;
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.$disconnect();
  });

  it("extracts multiple text transactions without persisting them", async () => {
    vi.stubEnv("OPENAI_BASE_URL", "https://aiping.cn/api/v1");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "test-model");
    vi.stubEnv("ALLOW_AI_IN_TEST", "true");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      items: [
        { direction: "EXPENSE", amount_yuan: "35.50", occurred_on: "2026-09-20", description: "午餐", category: "餐饮", special_kind: "NONE", analysis_treatment: "COUNT" },
        { direction: "EXPENSE", amount_yuan: "2000", occurred_on: null, description: "信用卡还款", category: "债务还款", special_kind: "CREDIT_CARD_PAYMENT", analysis_treatment: "COUNT" },
      ],
      warnings: [],
    }) } }] }), { status: 200 })));

    const result = await extractTransactionsFromText("9月20日午餐35.5元；信用卡还款2000元");
    expect(result.items[0]).toMatchObject({ amountMinor: "3550", category: "餐饮" });
    expect(result.items[1]).toMatchObject({ analysisTreatment: "EXCLUDE", occurredOn: null });
    expect(result.warnings[0]).toContain("缺少日期");
    expect(await db.transaction.count({ where: { workspaceId } })).toBe(0);
  });

  it("commits the reviewed batch in one independent revision", async () => {
    vi.unstubAllGlobals();
    const result = await commitTransactionImport(workspaceId, {
      expectedTransactionRevision: 0,
      source: "TEXT",
      items: [
        { direction: "EXPENSE", amountMinor: "3550", occurredOn: "2026-09-20", description: "午餐", category: "餐饮", specialKind: "NONE", analysisTreatment: "COUNT", classificationSource: "AI" },
        { direction: "EXPENSE", amountMinor: "200000", occurredOn: "2026-09-20", description: "信用卡还款", category: "债务还款", specialKind: "CREDIT_CARD_PAYMENT", analysisTreatment: "COUNT", classificationSource: "AI" },
      ],
    });
    expect(result).toMatchObject({ importedCount: 2, transactionRevision: 1 });
    const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    expect(workspace).toMatchObject({ transactionRevision: 1, portfolioRevision: 0 });
    const transactions = await db.transaction.findMany({ where: { workspaceId }, orderBy: { amountMinor: "asc" } });
    expect(transactions).toHaveLength(2);
    expect(transactions.every((item) => item.source === "TEXT")).toBe(true);
    expect(transactions[1].analysisTreatment).toBe("EXCLUDE");
  });

  it("warns when extracted transactions duplicate an existing ledger entry", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      items: [{ direction: "EXPENSE", amount_yuan: "35.50", occurred_on: "2026-09-20", description: "午餐", category: "餐饮", special_kind: "NONE", analysis_treatment: "COUNT" }],
      warnings: [],
    }) } }] }), { status: 200 })));
    const result = await extractTransactionsFromText("2026-09-20 午餐35.50元", workspaceId);
    expect(result.warnings).toContain("第1笔“午餐”与账本中的流水疑似重复");
  });

  it("extracts an image as a preview and records image source only after confirmation", async () => {
    vi.stubEnv("OPENAI_VISION_MODEL", "vision-test-model");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({
      items: [{ direction: "INCOME", amount_yuan: "88", occurred_on: "2026-09-21", description: "兼职收入", category: "其他收入", special_kind: "NONE", analysis_treatment: "COUNT" }],
      warnings: [],
    }) } }] }), { status: 200 })));
    const preview = await extractTransactionsFromImages([new NodeFile([new Uint8Array([1, 2, 3])], "bill.png", { type: "image/png" }) as unknown as File], workspaceId);
    expect(preview).toMatchObject({ mode: "IMAGE", items: [{ amountMinor: "8800", description: "兼职收入" }] });
    expect(await db.transaction.count({ where: { workspaceId } })).toBe(2);
    const saved = await commitTransactionImport(workspaceId, { expectedTransactionRevision: 1, source: "IMAGE", items: preview.items });
    expect(saved).toMatchObject({ importedCount: 1, transactionRevision: 2 });
    expect((await db.transaction.findFirstOrThrow({ where: { workspaceId, description: "兼职收入" } })).source).toBe("IMAGE");
  });

  it("rejects invalid amounts, future dates, and unsupported image inputs without partial writes", async () => {
    const before = await db.transaction.count({ where: { workspaceId } });
    await expect(commitTransactionImport(workspaceId, {
      expectedTransactionRevision: 2,
      source: "TEXT",
      items: [{ direction: "EXPENSE", amountMinor: "0", occurredOn: "2026-09-20", description: "无效金额", category: "其他支出", specialKind: "NONE", analysisTreatment: "COUNT", classificationSource: "USER" }],
    })).rejects.toThrow();
    await expect(commitTransactionImport(workspaceId, {
      expectedTransactionRevision: 2,
      source: "TEXT",
      items: [{ direction: "EXPENSE", amountMinor: "100", occurredOn: "2099-01-01", description: "未来流水", category: "其他支出", specialKind: "NONE", analysisTreatment: "COUNT", classificationSource: "USER" }],
    })).rejects.toThrow();
    await expect(extractTransactionsFromImages([new NodeFile(["x"], "bill.gif", { type: "image/gif" }) as unknown as File], workspaceId)).rejects.toThrow("仅支持 JPG、PNG 和 WebP 图片");
    const sixImages = Array.from({ length: 6 }, (_, index) => new NodeFile(["x"], `bill-${index}.png`, { type: "image/png" }) as unknown as File);
    await expect(extractTransactionsFromImages(sixImages, workspaceId)).rejects.toThrow("一次最多上传5张图片");
    await expect(extractTransactionsFromImages([{ type: "image/png", size: 8 * 1024 * 1024 + 1 } as File], workspaceId)).rejects.toThrow("每张图片不能超过8MB");
    expect(await db.transaction.count({ where: { workspaceId } })).toBe(before);
    expect((await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).transactionRevision).toBe(2);
  });

  it("keeps the batch intact when the expected revision is stale", async () => {
    await expect(commitTransactionImport(workspaceId, {
      expectedTransactionRevision: 0,
      source: "TEXT",
      items: [{ direction: "INCOME", amountMinor: "100", occurredOn: "2026-09-20", description: "收入", category: "其他收入", specialKind: "NONE", analysisTreatment: "COUNT", classificationSource: "USER" }],
    })).rejects.toMatchObject({ status: 409 });
    expect(await db.transaction.count({ where: { workspaceId } })).toBe(3);
  });
});
