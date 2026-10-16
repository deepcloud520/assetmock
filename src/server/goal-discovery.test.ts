import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { acknowledgeMultiGoalConsent, cancelGoalDiscovery, continueGoalDiscovery, getGoalDiscoverySession, startGoalDiscovery } from "./goal-discovery";
import { POST as cancelRoute } from "@/app/api/goal-discovery/[id]/cancel/route";

function aiResponse(value: object) {
  return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(value) } }] }), { status: 200 });
}

const completeDraft = {
  name: "三年后改善居住条件",
  target_amount_minor: "80000000",
  target_date: "2028-12-31",
  prepared_amount_minor: "20000000",
};

describe("goal discovery conversation", () => {
  let workspaceId = "";
  beforeAll(async () => {
    workspaceId = (await db.workspace.create({ data: { profile: { create: {} } } })).id;
    vi.stubEnv("OPENAI_BASE_URL", "https://aiping.cn/api/v1");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "test-model");
    vi.stubEnv("ALLOW_AI_IN_TEST", "true");
  });
  afterEach(async () => {
    vi.unstubAllGlobals();
    await db.agentSession.deleteMany({ where: { workspaceId, kind: "GOAL_DISCOVERY" } });
    await db.goal.deleteMany({ where: { workspaceId } });
    await db.workspace.update({ where: { id: workspaceId }, data: { multiGoalConsentAt: null } });
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.$disconnect();
  });

  it("starts with a natural invitation without creating a goal", async () => {
    const session = await startGoalDiscovery(workspaceId, undefined);
    expect(session?.kind).toBe("GOAL_DISCOVERY");
    expect(session?.messages[0].content).toContain("最想实现的一件事");
    expect(await db.goal.count({ where: { workspaceId } })).toBe(0);
  });

  it("keeps the four-field draft and creates only after explicit confirmation", async () => {
    const session = await startGoalDiscovery(workspaceId, undefined);
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(aiResponse({ status: "AWAITING_CONFIRMATION", message: "请确认：目标是三年后改善居住条件，金额80万元，日期2028年12月31日，已准备20万元。", draft: completeDraft, missing_fields: [], confirmation_quote: null }))
      .mockResolvedValueOnce(aiResponse({ status: "CONFIRMED", message: "已按你确认的信息创建目标。", draft: completeDraft, missing_fields: [], confirmation_quote: "确认" }));
    vi.stubGlobal("fetch", fetchMock);

    const review = await continueGoalDiscovery(workspaceId, session!.id, "目标预算80万元，已准备20万元，希望2028年12月31日前完成");
    expect(review?.status).toBe("WAITING_USER");
    expect(review?.draft).toEqual(completeDraft);
    expect(await db.goal.count({ where: { workspaceId } })).toBe(0);

    const completed = await continueGoalDiscovery(workspaceId, session!.id, "确认");
    expect(completed?.status).toBe("COMPLETED");
    const goal = await db.goal.findFirstOrThrow({ where: { workspaceId } });
    expect(goal).toMatchObject({ name: completeDraft.name, type: "OTHER", targetAmountMinor: 80000000n, preparedAmountMinor: 20000000n, priority: 1 });
    expect(goal.monthlyContributionMinor).toBe(0n);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("cancels an unfinished conversation through the API without creating a goal or changing the ledger", async () => {
    const before = await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const session = await startGoalDiscovery(workspaceId, undefined);
    const response = await cancelRoute(new Request("http://localhost/api/goal-discovery/cancel", { method: "POST", headers: { "X-Workspace-Id": workspaceId } }), { params: Promise.resolve({ id: session!.id }) });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "CANCELLED" });
    expect(await getGoalDiscoverySession(workspaceId)).toBeNull();
    await expect(continueGoalDiscovery(workspaceId, session!.id, "确认")).rejects.toThrow("已取消");
    expect(await db.goal.count({ where: { workspaceId } })).toBe(0);
    expect((await db.workspace.findUniqueOrThrow({ where: { id: workspaceId } })).portfolioRevision).toBe(before.portfolioRevision);
    const next = await startGoalDiscovery(workspaceId, undefined);
    expect(next!.id).not.toBe(session!.id);
    expect((await getGoalDiscoverySession(workspaceId))!.id).toBe(next!.id);
  });

  it("does not cancel another workspace's session or an in-flight/completed goal", async () => {
    const session = await startGoalDiscovery(workspaceId, undefined);
    const foreign = (await db.workspace.create({ data: {} })).id;
    try {
      await expect(cancelGoalDiscovery(foreign, session!.id)).rejects.toMatchObject({ status: 404 });
      await db.agentSession.update({ where: { id: session!.id }, data: { status: "PROCESSING" } });
      await expect(cancelGoalDiscovery(workspaceId, session!.id)).rejects.toMatchObject({ status: 409 });
      await db.agentSession.update({ where: { id: session!.id }, data: { status: "COMPLETED" } });
      await expect(cancelGoalDiscovery(workspaceId, session!.id)).rejects.toMatchObject({ status: 409 });
    } finally {
      await db.workspace.delete({ where: { id: foreign } });
    }
  });

  it.each(["ERROR", "WAITING_CONSENT"])("allows abandoning a %s session without calling the model", async (status) => {
    const session = await startGoalDiscovery(workspaceId, undefined);
    await db.agentSession.update({ where: { id: session!.id }, data: { status } });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect((await cancelGoalDiscovery(workspaceId, session!.id))?.status).toBe("CANCELLED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("enforces one-time informed consent before creating a second goal", async () => {
    await db.goal.create({ data: { workspaceId, name: "已有目标", type: "OTHER", targetAmountMinor: 100n, targetDate: new Date("2028-01-01"), priority: 1 } });
    const session = await startGoalDiscovery(workspaceId, undefined);
    const confirmed = { status: "CONFIRMED", message: "信息已确认。", draft: completeDraft, missing_fields: [], confirmation_quote: "确认" };
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(aiResponse(confirmed)));
    vi.stubGlobal("fetch", fetchMock);

    const waiting = await continueGoalDiscovery(workspaceId, session!.id, "确认");
    expect(waiting?.status).toBe("WAITING_CONSENT");
    expect(await db.goal.count({ where: { workspaceId } })).toBe(1);

    await acknowledgeMultiGoalConsent(workspaceId);
    const completed = await continueGoalDiscovery(workspaceId, session!.id, "再次确认");
    expect(completed?.status).toBe("COMPLETED");
    expect(await db.goal.count({ where: { workspaceId } })).toBe(2);
    expect(await db.auditEvent.count({ where: { workspaceId, action: "MULTI_GOAL_CONSENT" } })).toBe(1);
  });
});
