import { modelConfig } from "@/lib/model-config";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { PaperError, json } from "../../domain/paper-trading";
import { accountInsights, historyPage } from "./insights";
import { account, transaction } from "./service";

const schema = z.object({ message: z.string().min(1).max(6000), evidenceIds: z.array(z.string()).min(1).max(50) }).strict();
type Model = (prompt: string, input: unknown) => Promise<unknown>;
const promptVersion = "paper-review-v1.1";
const reviewPrompt = "你是投资管家的只读模拟交易复盘模块。只根据输入的程序金额、指标和交易事实说明执行情况、费用及资料限制。区分事实与推测，不保证收益，不修改策略或授权，不提交订单。引用只能从输入 evidenceIds 选择；缺少证据时说明未知。模型历史知识不能补足行情或公司行为。用中文解释，message 中指出引用记录标识。优先使用 displayValues 中程序已格式化的人民币元金额及百分比，不自行换算或重复舍入，不原样输出 Minor、bps 或 null。资料不足的指标明确说明尚不能判断；已确认的零是零，不是资料缺失。原始 insights、records 保留用于追溯，不能将展示格式改变解释为账本或策略发生变化。";
function amountDisplay(value: bigint | null) {
  if (value === null) return "资料不足";
  const absolute = value < 0n ? -value : value;
  const yuan = (absolute / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${value < 0n ? "-" : ""}${yuan}.${(absolute % 100n).toString().padStart(2, "0")} 元`;
}
function percentDisplay(value: number | null) {
  if (value === null) return "资料不足";
  if (!Number.isSafeInteger(value)) return "资料不足（指标精度无法确认）";
  const integer = BigInt(value), absolute = integer < 0n ? -integer : integer;
  return `${integer < 0n ? "-" : ""}${absolute / 100n}.${(absolute % 100n).toString().padStart(2, "0")}%`;
}
function displayValues(insights: Awaited<ReturnType<typeof accountInsights>>) {
  const p = insights.period;
  return { basis: "金额以整数人民币分通过 BigInt 精确换算为元；指标以程序计算的整数基点换算为百分比，未重新计算收益。",
    account: { initialCapital: amountDisplay(insights.initialMinor), cash: amountDisplay(insights.cashMinor), equity: amountDisplay(insights.equityMinor), profitLoss: amountDisplay(insights.accountPnlMinor), realizedProfitLoss: amountDisplay(insights.realizedMinor), floatingProfitLoss: amountDisplay(insights.floatingMinor), fees: amountDisplay(insights.feesMinor), corporateIncome: amountDisplay(insights.corporateIncomeMinor), return: percentDisplay(insights.accountReturnBps) },
    period: { turnover: amountDisplay(p.turnoverMinor), fees: amountDisplay(p.feeMinor), realizedProfitLoss: amountDisplay(p.realizedMinor), corporateIncome: amountDisplay(p.corporateIncomeMinor), turnoverRate: percentDisplay(p.turnoverBps), feeToTurnover: percentDisplay(p.feeToTurnoverBps), feeToInitialCapital: percentDisplay(p.feeToInitialBps) },
    risk: { maxDrawdown: percentDisplay(insights.maxDrawdownBps), largestPosition: percentDisplay(insights.concentration.largestPositionBps), stockAllocation: percentDisplay(insights.concentration.stockAllocationBps) },
    benchmark: insights.benchmark ? { accountReturn: percentDisplay(insights.benchmark.accountReturnBps), benchmarkReturn: percentDisplay(insights.benchmark.benchmarkReturnBps), basis: insights.benchmark.basis } : `资料不足：${insights.benchmarkMissing}`,
    coverage: { valuationQuality: insights.valuationQuality, validDailyCount: p.validDailyCount, missingDays: p.missingDays, unknownCalendarDays: p.unknownCalendarDays, drawdownBasis: insights.observations.note },
  };
}
export async function generatePaperReview(db: PrismaClient, workspaceId: string, raw: unknown, model?: Model) {
  const input = z.object({ accountId: z.string().min(1), from: z.string().optional(), to: z.string().optional(), key: z.string().min(8).max(100) }).strict().parse(raw);
  const prior = await db.paperOperationalEvent.findUnique({ where: { id: input.key } });
  if (prior) {
    if (prior.workspaceId !== workspaceId || prior.accountId !== input.accountId || !["AI_REVIEW", "AI_REVIEW_PENDING"].includes(prior.type)) throw new PaperError("请求编号不匹配", 409);
    const old = JSON.parse(prior.detailJson);
    if (json(old.request) !== json(input)) throw new PaperError("请求编号对应不同复盘", 409);
    if (prior.type === "AI_REVIEW") return old.result;
    if (Date.parse(old.expiresAt) > Date.now()) throw new PaperError("本次复盘正在生成，请稍后读取结果", 409);
  }
  const insights = await accountInsights(db, workspaceId, input.accountId, { from: input.from, to: input.to });
  const records = await historyPage(db, workspaceId, input.accountId, { kind: "FILLS", take: 50, from: input.from, to: input.to });
  const notes = await historyPage(db, workspaceId, input.accountId, { kind: "NOTES", take: 20 });
  const evidenceIds = [...insights.evidenceIds, ...records.records.map(r => `FILL:${r.id}`), ...notes.records.map(r => `NOTE:${r.id}`)];
  const formatted = displayValues(insights);
  const invoke = model ?? (async (p, data) => (await import("../agent-runtime")).structuredResponse(p, data, "paper_readonly_review", z.toJSONSchema(schema), 45000));
  const token = randomUUID();
  const claim = await transaction(db, async tx => {
    await account(tx, workspaceId, input.accountId, false);
    const existing = await tx.paperOperationalEvent.findUnique({ where: { id: input.key } });
    if (existing) {
      const old = JSON.parse(existing.detailJson);
      if (existing.workspaceId !== workspaceId || existing.accountId !== input.accountId || !["AI_REVIEW", "AI_REVIEW_PENDING"].includes(existing.type) || json(old.request) !== json(input)) throw new PaperError("请求编号不匹配或对应不同复盘", 409);
      if (existing.type === "AI_REVIEW") return { result: old.result };
      if (Date.parse(old.expiresAt) > Date.now()) throw new PaperError("本次复盘正在生成，请稍后读取结果", 409);
      await tx.paperOperationalEvent.delete({ where: { id: existing.id } });
    }
    await tx.paperOperationalEvent.create({ data: { id: input.key, workspaceId, accountId: input.accountId, type: "AI_REVIEW_PENDING", detailJson: json({ request: input, token, expiresAt: new Date(Date.now() + 60000).toISOString() }) } });
    return { token };
  });
  if ("result" in claim) return claim.result;
  try {
    const result = schema.parse(await invoke(reviewPrompt, JSON.parse(json({ insights, records, notes, displayValues: formatted, evidenceIds }))));
    if (result.evidenceIds.some(id => !evidenceIds.includes(id))) throw new PaperError("AI 复盘引用无法核对，请重新生成");
    return await transaction(db, async tx => {
    const a = await account(tx, workspaceId, input.accountId, false);
    if (a.version !== insights.accountVersion) throw new PaperError("复盘期间账户已变化，请重新生成", 409);
    const existing = await tx.paperOperationalEvent.findUnique({ where: { id: input.key } });
    if (!existing || existing.workspaceId !== workspaceId || existing.accountId !== input.accountId || existing.type !== "AI_REVIEW_PENDING" || JSON.parse(existing.detailJson).token !== token) throw new PaperError("复盘请求已变化，请重新生成", 409);
    await tx.paperOperationalEvent.update({ where: { id: input.key }, data: { type: "AI_REVIEW", detailJson: json({ request: input, result, accountVersion: a.version, model: modelConfig('OPENAI').MODEL ?? "not-configured", promptVersion, input: { insights, records, notes, displayValues: formatted } }) } });
    return result;
    });
  } catch (error) {
    await transaction(db, async tx => {
      const pending = await tx.paperOperationalEvent.findUnique({ where: { id: input.key } });
      if (pending?.type === "AI_REVIEW_PENDING" && pending.workspaceId === workspaceId && JSON.parse(pending.detailJson).token === token) await tx.paperOperationalEvent.delete({ where: { id: input.key } });
    });
    throw error;
  }
}
