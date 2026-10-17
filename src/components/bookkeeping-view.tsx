"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, ChevronDown, Files, LoaderCircle, Pencil, Plus, ReceiptText, Trash2, X } from "lucide-react";
import { currentDateInChina, expenseCategories, incomeCategories, transactionCategories } from "@/domain/transactions";
import { formatMoneyInput, minorToYuan, yuanToMinor } from "@/domain/money-input";
import { TransactionImportDialog } from "./transaction-import-dialog";

type Direction = "INCOME" | "EXPENSE";
type Treatment = "COUNT" | "EXCLUDE";
type SpecialKind = "NONE" | "TRANSFER" | "REFUND" | "CREDIT_CARD_PAYMENT";

type TransactionItem = {
  id: string;
  direction: Direction;
  amountMinor: string;
  occurredOn: string;
  description: string;
  category: string;
  specialKind: SpecialKind;
  analysisTreatment: Treatment;
  source: "MANUAL" | "TEXT" | "IMAGE";
  classificationSource: "AI" | "USER" | "FALLBACK";
};

type TransactionPage = {
  transactionRevision: number;
  items: TransactionItem[];
  nextCursor: string | null;
  summary: { incomeMinor: string; expenseMinor: string; balanceMinor: string };
  categories: string[];
};

type Draft = {
  direction: Direction;
  amount: string;
  occurredOn: string;
  description: string;
};

class RequestError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function api<T>(path: string, workspaceId: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", "X-Workspace-Id": workspaceId, ...options?.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new RequestError(body.error ?? "请求失败，请稍后重试", response.status);
  return body as T;
}

function money(value: string) {
  return new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", minimumFractionDigits: 2 }).format(Number(BigInt(value)) / 100);
}

function displayedDate(value: string) {
  return value.slice(0, 10);
}

const specialLabels: Record<SpecialKind, string> = {
  NONE: "普通流水",
  TRANSFER: "转账",
  REFUND: "退款",
  CREDIT_CARD_PAYMENT: "信用卡还款",
};

const sourceLabels: Record<TransactionItem["source"], string> = { MANUAL: "手动", TEXT: "文字识别", IMAGE: "图片识别" };

export function BookkeepingView({ workspaceId }: { workspaceId: string; onExecutionChange?: () => void }) {
  const today = currentDateInChina();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [directionFilter, setDirectionFilter] = useState<"ALL" | Direction>("ALL");
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [page, setPage] = useState<TransactionPage | null>(null);
  const [draft, setDraft] = useState<Draft>({ direction: "EXPENSE", amount: "", occurredOn: today, description: "" });
  const [editing, setEditing] = useState<TransactionItem | null>(null);
  const [deleting, setDeleting] = useState<TransactionItem | null>(null);
  const [importing, setImporting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const query = useMemo(() => {
    const params = new URLSearchParams({ month, limit: "50" });
    if (directionFilter !== "ALL") params.set("direction", directionFilter);
    if (categoryFilter !== "ALL") params.set("category", categoryFilter);
    return params;
  }, [month, directionFilter, categoryFilter]);

  const load = useCallback(async (cursor?: string) => {
    if (cursor) setLoadingMore(true);
    else setBusy(true);
    try {
      setError("");
      const params = new URLSearchParams(query);
      if (cursor) params.set("cursor", cursor);
      const next = await api<TransactionPage>(`/api/transactions?${params}`, workspaceId);
      setPage((current) => cursor && current ? { ...next, items: [...current.items, ...next.items] } : next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "读取流水失败");
    } finally {
      setBusy(false);
      setLoadingMore(false);
    }
  }, [query, workspaceId]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 3200);
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!page) return;
    setBusy(true);
    setError("");
    try {
      const result = await api<{ transaction: TransactionItem; classificationReason: string }>("/api/transactions", workspaceId, {
        method: "POST",
        body: JSON.stringify({
          expectedTransactionRevision: page.transactionRevision,
          direction: draft.direction,
          amountMinor: yuanToMinor(draft.amount),
          occurredOn: draft.occurredOn,
          description: draft.description,
        }),
      });
      const excluded = result.transaction.analysisTreatment === "EXCLUDE";
      showNotice(excluded ? `已保存并识别为${specialLabels[result.transaction.specialKind]}，不计入收支汇总` : `已保存，分类为“${result.transaction.category}”`);
      setDraft((value) => ({ ...value, amount: "", description: "" }));
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "保存失败");
      if (cause instanceof RequestError && cause.status === 409) await load();
    } finally {
      setBusy(false);
    }
  }

  async function saveEdit(value: TransactionItem, form: HTMLFormElement) {
    if (!page) return;
    const data = new FormData(form);
    setBusy(true);
    setError("");
    try {
      await api(`/api/transactions/${value.id}`, workspaceId, {
        method: "PUT",
        body: JSON.stringify({
          expectedTransactionRevision: page.transactionRevision,
          direction: data.get("direction"),
          amountMinor: yuanToMinor(data.get("amount")),
          occurredOn: data.get("occurredOn"),
          description: data.get("description"),
          category: data.get("category"),
          specialKind: data.get("specialKind"),
          analysisTreatment: data.get("analysisTreatment"),
        }),
      });
      setEditing(null);
      showNotice("流水已更新");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "修改失败");
      if (cause instanceof RequestError && cause.status === 409) await load();
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!page || !deleting) return;
    setBusy(true);
    setError("");
    try {
      await api(`/api/transactions/${deleting.id}`, workspaceId, {
        method: "DELETE",
        body: JSON.stringify({ expectedTransactionRevision: page.transactionRevision }),
      });
      setDeleting(null);
      showNotice("流水已删除");
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "删除失败");
      if (cause instanceof RequestError && cause.status === 409) await load();
    } finally { setBusy(false); }
  }

  return (
    <section aria-labelledby="bookkeeping-title" className="bookkeeping-page space-y-5">
      {notice && <div className="fixed right-5 top-20 z-50 flex items-center gap-2 border border-blue-200 bg-white px-4 py-3 text-sm font-medium text-blue-800 shadow-lg"><Check size={17} />{notice}</div>}
      {error && <div className="flex items-center justify-between border-l-4 border-rose-500 bg-rose-50 px-4 py-3 text-sm text-rose-800"><span>{error}</span><button className="icon-button" onClick={() => setError("")} aria-label="关闭错误提示"><X size={16} /></button></div>}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="eyebrow">日常流水</p><h1 id="bookkeeping-title" className="mt-1 text-2xl font-semibold">记账</h1><p className="mt-2 text-sm text-slate-500">记录每一笔收入与支出，分类由 Agent 协助完成。</p></div>

      </div>

      <>
          <form onSubmit={create} className="bookkeeping-entry-card border border-slate-300 bg-white p-4 sm:p-5">
            <div className="mb-4 flex flex-wrap items-center gap-2"><Plus size={18} className="text-blue-700" /><h2 className="text-base font-semibold">快速记一笔</h2><button type="button" className="button-secondary ml-auto" onClick={() => setImporting(true)}><Files size={16} />批量录入</button></div>
            <div className="bookkeeping-entry-grid">
              <fieldset className="field"><span>收支类型</span><div className="grid min-h-[2.65rem] grid-cols-2 border border-slate-300 p-1">
                {(["EXPENSE", "INCOME"] as Direction[]).map((direction) => <button type="button" key={direction} data-direction={direction} aria-pressed={draft.direction === direction} className={`bookkeeping-direction-button text-sm font-semibold ${draft.direction === direction ? direction === "INCOME" ? "bg-blue-700 text-white" : "bg-rose-600 text-white" : "text-slate-600"}`} onClick={() => setDraft({ ...draft, direction })}>{direction === "INCOME" ? "收入" : "支出"}</button>)}
              </div></fieldset>
              <label className="field"><span>金额</span><div className="money-input"><span>¥</span><input required inputMode="decimal" placeholder="0.00" value={draft.amount} onChange={(event) => setDraft({ ...draft, amount: event.target.value })} onBlur={() => setDraft((value) => ({ ...value, amount: formatMoneyInput(value.amount) }))} /></div></label>
              <label className="field"><span>日期</span><input required type="date" max={today} value={draft.occurredOn} onChange={(event) => setDraft({ ...draft, occurredOn: event.target.value })} /></label>
              <label className="field bookkeeping-description"><span>一句话说明</span><input required maxLength={120} placeholder="例如：午餐、工资到账、信用卡还款" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
              <button className="button-primary self-end" disabled={busy || !page}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Plus size={16} />}保存流水</button>
            </div>
          </form>

          <div className="grid gap-3 sm:grid-cols-3" aria-label={`${month} 收支汇总`}>
            <Summary label="收入" value={page?.summary.incomeMinor ?? "0"} tone="income" />
            <Summary label="支出" value={page?.summary.expenseMinor ?? "0"} tone="expense" />
            <Summary label="结余" value={page?.summary.balanceMinor ?? "0"} tone="balance" />
          </div>

          <div className="bookkeeping-list-card border border-slate-300 bg-white"><h2 className="px-4 pt-4 text-base font-semibold">流水记录</h2>
            <div className="flex flex-wrap items-end gap-3 border-b border-slate-200 p-4">
              <label className="field min-w-[9rem]"><span>月份</span><input type="month" max={today.slice(0, 7)} value={month} onChange={(event) => setMonth(event.target.value)} /></label>
              <label className="field min-w-[9rem]"><span>收支</span><select value={directionFilter} onChange={(event) => setDirectionFilter(event.target.value as "ALL" | Direction)}><option value="ALL">全部</option><option value="INCOME">收入</option><option value="EXPENSE">支出</option></select></label>
              <label className="field min-w-[10rem]"><span>分类</span><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="ALL">全部分类</option>{transactionCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
              <span className="ml-auto pb-3 text-xs text-slate-400">流水版本 {page?.transactionRevision ?? 0}</span>
            </div>

            {busy && !page ? <div className="grid min-h-52 place-items-center text-sm text-slate-500"><LoaderCircle className="mr-2 inline animate-spin" size={17} />正在读取流水</div> : page?.items.length ? (
              <div className="transaction-list">
                <div className="transaction-row transaction-header" aria-hidden="true"><span>日期</span><span>类型</span><span>说明</span><span>分类</span><span>金额</span><span>统计</span><span>操作</span></div>
                {page.items.map((item) => <div className="transaction-row" key={item.id}>
                  <span data-label="日期"><CalendarDays size={14} className="hidden text-slate-400 sm:inline" />{displayedDate(item.occurredOn)}</span>
                  <span data-label="类型"><b className={item.direction === "INCOME" ? "text-blue-700" : "text-rose-700"}>{item.direction === "INCOME" ? "收入" : "支出"}</b></span>
                  <span data-label="说明" className="min-w-0"><span className="block truncate font-medium text-slate-800">{item.description}</span><small className="text-slate-400">来源：{sourceLabels[item.source] ?? "手动"}{item.specialKind !== "NONE" ? ` · ${specialLabels[item.specialKind]}` : ""}</small></span>
                  <span data-label="分类">{item.category}</span>
                  <span data-label="金额" className={`font-semibold tabular-nums ${item.direction === "INCOME" ? "text-blue-700" : "text-slate-800"}`}>{item.direction === "INCOME" ? "+" : "-"}{money(item.amountMinor)}</span>
                  <span data-label="统计">{item.analysisTreatment === "COUNT" ? "计入" : <span className="text-amber-700">已排除</span>}</span>
                  <span data-label="操作" className="flex gap-1"><button className="icon-button" title="编辑" aria-label={`编辑${item.description}`} onClick={() => setEditing(item)}><Pencil size={16} /></button><button className="icon-button text-rose-600" title="删除" aria-label={`删除${item.description}`} onClick={() => setDeleting(item)}><Trash2 size={16} /></button></span>
                </div>)}
                {page.nextCursor && <div className="border-t border-slate-200 p-4 text-center"><button className="button-secondary" disabled={loadingMore} onClick={() => load(page.nextCursor!)}>{loadingMore ? <LoaderCircle className="animate-spin" size={16} /> : <ChevronDown size={16} />}继续加载</button></div>}
              </div>
            ) : <div className="grid min-h-52 place-items-center px-6 text-center"><div><ReceiptText className="mx-auto text-slate-300" size={30} /><p className="mt-3 text-sm font-semibold text-slate-700">这个月还没有符合条件的流水</p><p className="mt-1 text-xs text-slate-400">从上方记录第一笔收入或支出。</p></div></div>}
          </div>
      </>

      {editing && <EditDialog item={editing} busy={busy} today={today} onClose={() => setEditing(null)} onSave={saveEdit} />}
      {importing && page && <TransactionImportDialog workspaceId={workspaceId} revision={page.transactionRevision} onClose={() => setImporting(false)} onCommitted={(count) => { setImporting(false); showNotice(`已写入 ${count} 笔流水`); void load(); }} />}
      {deleting && <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="delete-transaction-title"><div className="editor-panel max-w-md"><div className="p-6"><h2 id="delete-transaction-title" className="text-lg font-semibold">删除这笔流水？</h2><p className="mt-2 text-sm text-slate-500">“{deleting.description}”删除后不再显示，也不会进入汇总。</p><div className="mt-6 flex justify-end gap-2"><button className="button-secondary" onClick={() => setDeleting(null)}>取消</button><button className="button-danger" disabled={busy} onClick={remove}><Trash2 size={16} />确认删除</button></div></div></div></div>}
    </section>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone: "income" | "expense" | "balance" }) {
  const color = tone === "income" ? "text-blue-700" : tone === "expense" ? "text-rose-700" : BigInt(value) < 0n ? "text-rose-700" : "text-slate-900";
  return <div className={`bookkeeping-summary-card bookkeeping-summary-${tone} border border-slate-300 bg-white p-4`}><p className="text-xs font-semibold text-slate-500">本月{label}</p><p className={`mt-2 text-xl font-semibold tabular-nums ${color}`}>{money(value)}</p></div>;
}

function EditDialog({ item, busy, today, onClose, onSave }: { item: TransactionItem; busy: boolean; today: string; onClose: () => void; onSave: (item: TransactionItem, form: HTMLFormElement) => void }) {
  const [direction, setDirection] = useState<Direction>(item.direction);
  const allowedCategories = direction === "INCOME" ? incomeCategories : expenseCategories;
  return <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="edit-transaction-title"><form className="editor-panel max-w-xl" onSubmit={(event) => { event.preventDefault(); onSave(item, event.currentTarget); }}>
    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4"><h2 id="edit-transaction-title" className="font-semibold">编辑流水</h2><button type="button" className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button></div>
    <div className="form-grid p-5">
      <label className="field"><span>收支类型</span><select name="direction" value={direction} onChange={(event) => setDirection(event.target.value as Direction)}><option value="INCOME">收入</option><option value="EXPENSE">支出</option></select></label>
      <label className="field"><span>金额</span><input name="amount" required inputMode="decimal" defaultValue={minorToYuan(item.amountMinor)} /></label>
      <label className="field"><span>日期</span><input name="occurredOn" required type="date" max={today} defaultValue={displayedDate(item.occurredOn)} /></label>
      <label className="field"><span>分类</span><select name="category" defaultValue={allowedCategories.includes(item.category as never) ? item.category : allowedCategories.at(-1)}>{allowedCategories.map((category) => <option key={category}>{category}</option>)}</select></label>
      <label className="field sm:col-span-2"><span>说明</span><input name="description" required maxLength={120} defaultValue={item.description} /></label>
      <label className="field"><span>流水性质</span><select name="specialKind" defaultValue={item.specialKind}>{Object.entries(specialLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field"><span>收支统计</span><select name="analysisTreatment" defaultValue={item.analysisTreatment}><option value="COUNT">计入汇总</option><option value="EXCLUDE">排除出汇总</option></select></label>
    </div>
    <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-4"><button type="button" className="button-secondary" onClick={onClose}>取消</button><button className="button-primary" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />}保存修改</button></div>
  </form></div>;
}
