import type { PrismaClient } from "@prisma/client";
import { csvCell, json } from "../../domain/paper-trading";
import { account } from "./service";

// Export one consistent account snapshot. A replay export cannot leak future bars.
export async function exportPaperAccount(db: PrismaClient, workspaceId: string, accountId: string) {
  const records = await db.$transaction(async tx => {
    const a = await account(tx, workspaceId, accountId, false);
    const where = { workspaceId, accountId };
    const [entries, orders, notes, snapshots, adjustments, conditions, operations, reconciliations, positions, experiment, replay] = await Promise.all([
      tx.paperCashEntry.findMany({ where, orderBy: { createdAt: "asc" } }),
      tx.paperOrder.findMany({ where, orderBy: { createdAt: "asc" }, include: { fills: { include: { quote: true }, orderBy: { createdAt: "asc" } }, events: { orderBy: { createdAt: "asc" } } } }),
      tx.paperReviewNote.findMany({ where, orderBy: { createdAt: "asc" } }),
      tx.paperEquitySnapshot.findMany({ where, orderBy: { createdAt: "asc" } }),
      tx.paperAdjustment.findMany({ where, orderBy: { createdAt: "asc" } }),
      tx.paperCondition.findMany({ where, orderBy: { createdAt: "asc" } }),
      tx.paperOperationalEvent.findMany({ where, orderBy: { createdAt: "asc" } }),
      tx.paperReconciliation.findMany({ where, orderBy: { createdAt: "asc" } }),
      tx.paperPosition.findMany({ where, include: { lots: true } }),
      tx.paperStrategyExperiment.findFirst({ where, include: { strategies: true, pools: true, authorizations: true, runs: true } }),
      tx.paperReplaySession.findFirst({ where, include: { dataset: true } }),
    ]);
    const bars = replay ? await tx.paperReplayBar.findMany({ where: { workspaceId, datasetId: replay.datasetId, closeAt: { lte: replay.clock } }, orderBy: [{ closeAt: "asc" }, { instrumentId: "asc" }] }) : [];
    const rule = await tx.paperRuleVersion.findUniqueOrThrow({ where: { id: a.ruleId } });
    return { a, entries, orders, notes, snapshots, adjustments, conditions, operations, reconciliations, positions, experiment, replay, bars, rule };
  });
  const lines: unknown[][] = [["模拟交易记录", "编号", "北京时间", "类型", "证券", "数量", "金额（分）", "费用（分）", "余额（分）", "关联编号／原始理由／结构化资料"]];
  const date = (d: Date) => new Date(d.getTime() + 8 * 3600000).toISOString().replace("T", " ").replace("Z", " +08:00");
  const detail = (type: string, id: string, data: unknown, at?: Date) => lines.push([type, id, at ? date(at) : "", "", "", "", "", "", "", json(data)]);
  detail("账户", records.a.id, records.a, records.a.createdAt);
  detail("交易规则", records.rule.id, records.rule);
  records.entries.forEach(r => lines.push(["资金流水", r.id, date(r.createdAt), r.type, "", "", r.amountMinor, "", r.balanceMinor, r.reference]));
  records.orders.forEach(o => {
    lines.push(["委托", o.id, date(o.createdAt), `${o.side}/${o.status}`, o.instrumentId, o.quantity, o.limitMinor, o.feesMinor, "", o.reason]);
    o.fills.forEach(f => { lines.push(["成交", f.id, date(f.createdAt), o.side, o.instrumentId, f.quantity, f.priceMinor * BigInt(f.quantity), f.feeMinor, "", `${o.id};${f.quoteId};${o.ruleId}`]); detail("成交行情", f.quote.id, f.quote, f.quote.sourceAt); });
    o.events.forEach(e => detail("委托事件", e.id, e, e.createdAt));
  });
  for (const [type, rows] of [["复盘笔记", records.notes], ["估值", records.snapshots], ["公司行为", records.adjustments], ["条件单", records.conditions], ["运行记录", records.operations], ["对账报告", records.reconciliations], ["持仓", records.positions]] as const) rows.forEach(r => detail(type, r.id, r, "createdAt" in r ? r.createdAt : undefined));
  const e = records.experiment;
  if (e) {
    detail("策略实验", e.id, { ...e, strategies: undefined, pools: undefined, authorizations: undefined, runs: undefined }, e.createdAt);
    e.strategies.forEach(s => detail("策略版本", s.id, s, s.createdAt));
    e.pools.forEach(p => detail("股票池版本", p.id, p, p.confirmedAt));
    e.authorizations.forEach(a => detail("授权", a.id, a, a.confirmedAt));
    e.runs.forEach(r => detail("策略分析", r.id, r, r.startedAt));
  }
  if (records.replay) { detail("回放会话", records.replay.id, records.replay); records.bars.forEach(b => detail("已知历史K线", b.id, b, b.closeAt)); }
  return "\uFEFF" + lines.map(l => l.map(csvCell).join(",")).join("\r\n");
}
