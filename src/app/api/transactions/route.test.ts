import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { currentDateInChina } from "@/domain/transactions";
import { DELETE, PUT } from "./[id]/route";
import { GET, POST } from "./route";

function request(path: string, workspaceId: string, method = "GET", body?: object) {
  return new Request(`http://localhost${path}`, {
    method,
    headers: { "Content-Type": "application/json", "X-Workspace-Id": workspaceId },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

describe("transactions API", () => {
  let workspaceId = "";
  let otherWorkspaceId = "";
  let transactionId = "";
  const today = currentDateInChina();

  beforeAll(async () => {
    const [workspace, otherWorkspace] = await Promise.all([db.workspace.create({ data: {} }), db.workspace.create({ data: {} })]);
    workspaceId = workspace.id;
    otherWorkspaceId = otherWorkspace.id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await db.$disconnect();
  });

  it("creates and lists a transaction without changing portfolio revision", async () => {
    const createdResponse = await POST(request("/api/transactions", workspaceId, "POST", {
      expectedTransactionRevision: 0,
      direction: "EXPENSE",
      amountMinor: "2580",
      occurredOn: today,
      description: "午餐",
    }));
    expect(createdResponse.status).toBe(201);
    const created = await createdResponse.json();
    transactionId = created.transaction.id;
    expect(created.transaction.category).toBe("其他支出");
    expect(created.transaction.classificationSource).toBe("FALLBACK");
    expect(created.transactionRevision).toBe(1);

    const listedResponse = await GET(request(`/api/transactions?month=${today.slice(0, 7)}`, workspaceId));
    const listed = await listedResponse.json();
    expect(listed.items).toHaveLength(1);
    expect(listed.summary).toEqual({ incomeMinor: "0", expenseMinor: "2580", balanceMinor: "-2580" });

    const workspace = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    expect(workspace.transactionRevision).toBe(1);
    expect(workspace.portfolioRevision).toBe(0);
  });

  it("rejects stale writes and preserves the existing transaction", async () => {
    const response = await PUT(request(`/api/transactions/${transactionId}`, workspaceId, "PUT", {
      expectedTransactionRevision: 0,
      direction: "EXPENSE",
      amountMinor: "3000",
      occurredOn: today,
      description: "修改后的午餐",
      category: "餐饮",
      specialKind: "NONE",
      analysisTreatment: "COUNT",
    }), { params: Promise.resolve({ id: transactionId }) });
    expect(response.status).toBe(409);
    const existing = await db.transaction.findUniqueOrThrow({ where: { id: transactionId } });
    expect(existing.amountMinor).toBe(2580n);
  });

  it("isolates workspaces and validates future dates", async () => {
    const otherResponse = await PUT(request(`/api/transactions/${transactionId}`, otherWorkspaceId, "PUT", {
      expectedTransactionRevision: 0,
      direction: "EXPENSE",
      amountMinor: "3000",
      occurredOn: today,
      description: "不应成功",
      category: "餐饮",
      specialKind: "NONE",
      analysisTreatment: "COUNT",
    }), { params: Promise.resolve({ id: transactionId }) });
    expect(otherResponse.status).toBe(404);

    const future = new Date(`${today}T00:00:00.000Z`);
    future.setUTCDate(future.getUTCDate() + 2);
    const futureResponse = await POST(request("/api/transactions", workspaceId, "POST", {
      expectedTransactionRevision: 1,
      direction: "INCOME",
      amountMinor: "1",
      occurredOn: future.toISOString().slice(0, 10),
      description: "未来收入",
    }));
    expect(futureResponse.status).toBe(422);
  });

  it("updates, excludes, and soft deletes a transaction", async () => {
    const updatedResponse = await PUT(request(`/api/transactions/${transactionId}`, workspaceId, "PUT", {
      expectedTransactionRevision: 1,
      direction: "EXPENSE",
      amountMinor: "3000",
      occurredOn: today,
      description: "信用卡还款",
      category: "债务还款",
      specialKind: "CREDIT_CARD_PAYMENT",
      analysisTreatment: "EXCLUDE",
    }), { params: Promise.resolve({ id: transactionId }) });
    const updated = await updatedResponse.json();
    expect(updatedResponse.status).toBe(200);
    expect(updated.transaction.classificationSource).toBe("USER");
    expect(updated.transactionRevision).toBe(2);

    const listed = await (await GET(request(`/api/transactions?month=${today.slice(0, 7)}`, workspaceId))).json();
    expect(listed.summary.expenseMinor).toBe("0");

    const deletedResponse = await DELETE(request(`/api/transactions/${transactionId}`, workspaceId, "DELETE", {
      expectedTransactionRevision: 2,
    }), { params: Promise.resolve({ id: transactionId }) });
    expect(deletedResponse.status).toBe(200);
    const afterDelete = await (await GET(request("/api/transactions", workspaceId))).json();
    expect(afterDelete.items).toHaveLength(0);
    expect((await db.transaction.findUniqueOrThrow({ where: { id: transactionId } })).deletedAt).not.toBeNull();
  });
});
