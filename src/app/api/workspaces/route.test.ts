import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { POST } from "./route";

describe("workspace creation", () => {
  let workspaceId = "";

  afterAll(async () => {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.$disconnect();
  });

  it("creates the complete starter ledger", async () => {
    const response = await POST();
    const created = await response.json();
    workspaceId = created.id;
    const workspace = await db.workspace.findUniqueOrThrow({
      where: { id: workspaceId },
      include: { assets: true, liabilities: true, profile: true },
    });

    expect(workspace.assets.map((item) => item.name)).toEqual(expect.arrayContaining([
      "银行卡活期", "微信钱包", "支付宝余额和余额宝", "其他钱包", "定期存款", "基金", "股票", "房车及其他固定资产",
    ]));
    expect(workspace.liabilities.map((item) => item.name)).toEqual(expect.arrayContaining([
      "信用卡债务", "花呗", "美团月付", "其他互联网支付", "贷款", "分期付款1",
    ]));
    expect(workspace.assets).toHaveLength(8);
    expect(workspace.liabilities).toHaveLength(6);
    expect(workspace.profile).not.toBeNull();
  });
});
