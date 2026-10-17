"use client";

import { FormEvent, useState } from "react";
import { Check, FileText, Image as ImageIcon, LoaderCircle, Sparkles, Trash2, Upload, X } from "lucide-react";
import { currentDateInChina, expenseCategories, incomeCategories } from "@/domain/transactions";
import { minorToYuan, yuanToMinor } from "@/domain/money-input";

type ImportItem = {
  direction: "INCOME" | "EXPENSE";
  amountMinor: string | null;
  occurredOn: string | null;
  description: string;
  category: string;
  specialKind: "NONE" | "TRANSFER" | "REFUND" | "CREDIT_CARD_PAYMENT";
  analysisTreatment: "COUNT" | "EXCLUDE";
  classificationSource: "AI" | "USER";
};

type Preview = { mode: "TEXT" | "IMAGE"; items: ImportItem[]; warnings: string[] };

export function TransactionImportDialog({ workspaceId, revision, onClose, onCommitted }: { workspaceId: string; revision: number; onClose: () => void; onCommitted: (count: number) => void }) {
  const [mode, setMode] = useState<"TEXT" | "IMAGE">("TEXT");
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = currentDateInChina();

  async function extract(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.set("mode", mode);
      if (mode === "TEXT") form.set("text", text);
      else files.forEach((file) => form.append("images", file));
      const response = await fetch("/api/transactions/import", { method: "POST", headers: { "X-Workspace-Id": workspaceId }, body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "识别失败，请稍后重试");
      setPreview(body as Preview);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "识别失败"); }
    finally { setBusy(false); }
  }

  function update(index: number, patch: Partial<ImportItem>) {
    setPreview((current) => current ? { ...current, items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch, classificationSource: "USER" } : item) } : current);
  }

  async function commit() {
    if (!preview?.items.length) return;
    setBusy(true);
    setError("");
    try {
      const items = preview.items.map((item) => ({ ...item, amountMinor: yuanToMinor(minorToYuan(item.amountMinor ?? "0")) }));
      const response = await fetch("/api/transactions/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Workspace-Id": workspaceId },
        body: JSON.stringify({ expectedTransactionRevision: revision, source: preview.mode, items }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? "保存失败，请稍后重试");
      onCommitted(body.importedCount as number);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存失败"); }
    finally { setBusy(false); }
  }

  const ready = Boolean(preview?.items.length && preview.items.every((item) => item.amountMinor && BigInt(item.amountMinor) > 0n && item.occurredOn && item.description.trim()));

  return <div className="dialog-backdrop" role="dialog" aria-modal="true" aria-labelledby="transaction-import-title"><div className="import-panel max-w-5xl">
    <div className="flex items-start justify-between border-b border-slate-200 px-5 py-4"><div><h2 id="transaction-import-title" className="font-semibold">批量录入流水</h2><p className="mt-1 text-xs text-slate-500">AI 先提取为草稿，核对后才会写入账本。</p></div><button className="icon-button" onClick={onClose} aria-label="关闭"><X size={18} /></button></div>
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      {!preview ? <form onSubmit={extract}>
        <div className="inline-flex border border-slate-300 bg-white p-1">
          <button type="button" className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold ${mode === "TEXT" ? "bg-blue-700 text-white" : "text-slate-600"}`} onClick={() => setMode("TEXT")}><FileText size={16} />粘贴文字</button>
          <button type="button" className={`flex items-center gap-2 px-4 py-2 text-sm font-semibold ${mode === "IMAGE" ? "bg-blue-700 text-white" : "text-slate-600"}`} onClick={() => setMode("IMAGE")}><ImageIcon size={16} />上传图片</button>
        </div>
        {mode === "TEXT" ? <label className="field mt-5"><span>流水文字</span><textarea className="min-h-56 border border-slate-300 p-3 text-sm leading-6 outline-none focus:border-blue-600" required maxLength={30000} value={text} onChange={(event) => setText(event.target.value)} placeholder={'例如：\n9月20日 午餐 35元\n9月21日 工资到账 12000元'} /></label> : <div className="mt-5 border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><Upload className="mx-auto text-slate-400" size={30} /><p className="mt-3 text-sm font-semibold">选择账单或交易记录图片</p><p className="mt-1 text-xs text-slate-500">支持 JPG、PNG、WebP；最多5张，每张不超过8MB。</p><p className="mt-2 text-xs leading-5 text-slate-500">点击开始识别后，所选图片会发送给当前配置的多模态模型进行提取。</p><label className="button-secondary mt-4 cursor-pointer"><Upload size={16} />选择图片<input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []).slice(0, 5))} /></label>{files.length > 0 && <p className="mt-3 text-xs text-blue-700">已选择 {files.length} 张：{files.map((file) => file.name).join("、")}</p>}</div>}
        {error && <p className="mt-4 border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
        <div className="mt-5 flex justify-end"><button className="button-primary" disabled={busy || (mode === "TEXT" ? !text.trim() : !files.length)}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Sparkles size={16} />}开始识别</button></div>
      </form> : <>
        {preview.warnings.length > 0 && <div className="mb-4 border-l-4 border-amber-500 bg-amber-50 px-4 py-3 text-sm text-amber-900"><p className="font-semibold">请重点核对</p><ul className="mt-1 list-disc pl-5">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
        <div className="transaction-import-table"><div className="transaction-import-row transaction-import-header"><span>收支</span><span>日期</span><span>说明</span><span>金额（元）</span><span>分类</span><span>统计</span><span /></div>
          {preview.items.map((item, index) => {
            const categories = item.direction === "INCOME" ? incomeCategories : expenseCategories;
            return <div className="transaction-import-row" key={`${index}-${item.description}`}>
              <select aria-label={`第${index + 1}笔收支`} value={item.direction} onChange={(event) => { const direction = event.target.value as ImportItem["direction"]; update(index, { direction, category: direction === "INCOME" ? "其他收入" : "其他支出" }); }}><option value="EXPENSE">支出</option><option value="INCOME">收入</option></select>
              <input aria-label={`第${index + 1}笔日期`} type="date" max={today} value={item.occurredOn ?? ""} onChange={(event) => update(index, { occurredOn: event.target.value })} />
              <input aria-label={`第${index + 1}笔说明`} maxLength={120} value={item.description} onChange={(event) => update(index, { description: event.target.value })} />
              <input aria-label={`第${index + 1}笔金额`} inputMode="decimal" value={item.amountMinor ? minorToYuan(item.amountMinor) : ""} onChange={(event) => { try { update(index, { amountMinor: yuanToMinor(event.target.value) }); } catch { /* wait for valid amount */ } }} />
              <select aria-label={`第${index + 1}笔分类`} value={item.category} onChange={(event) => update(index, { category: event.target.value })}>{categories.map((category) => <option key={category}>{category}</option>)}</select>
              <select aria-label={`第${index + 1}笔统计方式`} value={item.analysisTreatment} onChange={(event) => update(index, { analysisTreatment: event.target.value as ImportItem["analysisTreatment"] })}><option value="COUNT">计入</option><option value="EXCLUDE">排除</option></select>
              <button className="icon-button text-rose-600" aria-label={`移除第${index + 1}笔`} onClick={() => setPreview({ ...preview, items: preview.items.filter((_, itemIndex) => itemIndex !== index) })}><Trash2 size={16} /></button>
            </div>;
          })}
        </div>
        {error && <p className="mt-4 border-l-4 border-rose-500 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>}
      </>}
    </div>
    {preview && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-4"><button className="button-secondary" onClick={() => { setPreview(null); setError(""); }}>重新识别</button><div className="flex items-center gap-2"><span className="text-xs text-slate-500">共 {preview.items.length} 笔</span><button className="button-primary" disabled={busy || !ready} onClick={commit}>{busy ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />}确认写入账本</button></div></div>}
  </div></div>;
}
