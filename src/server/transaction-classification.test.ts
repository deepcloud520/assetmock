import { afterEach, describe, expect, it, vi } from "vitest";
import { classifyTransaction } from "./transaction-classification";

describe("transaction classification", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("falls back without losing the transaction when the model is unavailable", async () => {
    await expect(classifyTransaction("INCOME", "一笔暂时无法识别的收入")).resolves.toMatchObject({
      category: "其他收入",
      specialKind: "NONE",
      analysisTreatment: "COUNT",
      classificationSource: "FALLBACK",
    });
    await expect(classifyTransaction("EXPENSE", "一笔暂时无法识别的支出")).resolves.toMatchObject({
      category: "其他支出",
      classificationSource: "FALLBACK",
    });
  });

  it("forces transfers, refunds, and credit-card payments out of cashflow statistics", async () => {
    vi.stubEnv("OPENAI_BASE_URL", "https://aiping.cn/api/v1");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "test-model");
    vi.stubEnv("ALLOW_AI_IN_TEST", "true");
    const outputs = [
      { category: "资金转账", specialKind: "TRANSFER", analysisTreatment: "COUNT", reason: "账户间转账" },
      { category: "退款", specialKind: "REFUND", analysisTreatment: "COUNT", reason: "原消费退款" },
      { category: "债务还款", specialKind: "CREDIT_CARD_PAYMENT", analysisTreatment: "COUNT", reason: "信用卡还款" },
    ];
    const fetchMock = vi.fn();
    for (const output of outputs) fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(classifyTransaction("EXPENSE", "转到另一个账户")).resolves.toMatchObject({ specialKind: "TRANSFER", analysisTreatment: "EXCLUDE" });
    await expect(classifyTransaction("INCOME", "购物退款")).resolves.toMatchObject({ specialKind: "REFUND", analysisTreatment: "EXCLUDE" });
    await expect(classifyTransaction("EXPENSE", "信用卡还款")).resolves.toMatchObject({ specialKind: "CREDIT_CARD_PAYMENT", analysisTreatment: "EXCLUDE" });
  });
});
