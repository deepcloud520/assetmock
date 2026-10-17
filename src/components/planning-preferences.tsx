"use client";
import { useEffect, useState } from "react";
import "./car-planning.css";

type Memory = { id: string; version: number; content: string; quote: string; evidenceType: string; sourceRef: string; scope: string; nature: string; status: string; decisionId: string | null; decisionName: string | null; ruleJson: string; ruleTargetLabel: string | null; reviewWhen: string; confirmedAt: string | null };
const evidenceLabels: Record<string, string> = { EXPRESSION: "用户明确表达", CHOICE: "已确认的选择", INFERENCE: "待核实理解" };
async function request<T>(workspaceId: string, suffix = "", body?: object): Promise<T> {
  const response = await fetch(`/api/planning-memories${suffix}`, { method: body ? "PATCH" : "GET", headers: { "Content-Type": "application/json", "X-Workspace-Id": workspaceId }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json(); if (!response.ok) throw new Error(result.error || "未能保存偏好"); return result;
}
export function PlanningPreferences({ workspaceId, decisionId, refreshKey = 0, disabled = false, onChange }: { workspaceId: string; decisionId?: string; refreshKey?: number; disabled?: boolean; onChange?: () => Promise<void> }) {
  const [rows, setRows] = useState<Memory[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Memory | null>(null);
  const [text, setText] = useState("");
  const [global, setGlobal] = useState(false);
  const [hard, setHard] = useState(false);
  useEffect(() => { let active = true; request<Memory[]>(workspaceId).then((r) => { if (active) setRows(r); }).catch((e: Error) => { if (active) setError(e.message); }); return () => { active = false; }; }, [workspaceId, refreshKey]);
  async function update(row: Memory, action: "DELETE" | "CORRECT" | "CONFIRM") {
    setBusy(true); setError("");
    try {
      await request(workspaceId, `/${row.id}`, { expectedVersion: row.version, action, ...(action === "DELETE" ? {} : { content: text, scope: global ? "GLOBAL" : "DECISION", nature: hard ? "HARD" : "SOFT", confirmScope: global, confirmConstraint: hard }) });
      setRows(await request<Memory[]>(workspaceId)); setEditing(null); await onChange?.();
    } catch (e) { setError(e instanceof Error ? e.message : "未能保存"); } finally { setBusy(false); }
  }
  const relevant = rows.filter((r) => !decisionId || r.decisionId === decisionId || r.scope === "GLOBAL");
  function item(row: Memory) {
    const rule = { kind: "NONE", ...JSON.parse(row.ruleJson) };
    return <article className="planning-memory" key={row.id}>
      <p><strong>{row.content}</strong><span className="planning-memory-tag">{row.status === "REVIEW" ? "待复核" : row.nature === "HARD" ? "已确认硬约束" : "参考信息"}</span></p>
      <p className="car-hint">{row.scope === "GLOBAL" ? "跨目标适用（用户确认）" : `仅用于：${row.decisionName || "当前买车目标"}`} · {evidenceLabels[row.evidenceType]}</p>
      <details><summary>查看依据</summary><blockquote>{row.quote}</blockquote><p className="car-hint">来源：{row.sourceRef}。{row.reviewWhen}</p></details>
      {editing?.id === row.id ? <div className="planning-memory-editor"><label>纠正这条理解<textarea value={text} maxLength={500} onChange={(e) => setText(e.target.value)} /></label>
        <label className="car-check"><input type="checkbox" checked={global} onChange={(e) => setGlobal(e.target.checked)} />我明确希望这条规则也用于以后其他目标</label>
        {rule.kind !== "NONE" && <label className="car-check"><input type="checkbox" checked={hard} onChange={(e) => setHard(e.target.checked)} />确认作为计算约束：{rule.kind === "CASH_ONLY" ? "仅比较全款" : `不动用「${row.ruleTargetLabel ?? "已失效的资产，需重新核对"}」`}</label>}
        <p className="car-hint">修改后需要重新计算并确认方案；不会改变已生效计划。</p>
        <div className="car-buttons"><button type="button" className="button-primary" disabled={disabled || busy || !text.trim()} onClick={() => void update(row, "CORRECT")}>确认保存</button><button type="button" className="button-secondary" onClick={() => setEditing(null)}>取消</button></div>
      </div> : <div className="car-buttons"><button type="button" className="button-secondary" disabled={disabled || busy} onClick={() => { setEditing(row); setText(row.content); setGlobal(row.scope === "GLOBAL"); setHard(false); }}>纠正或确认范围</button><button type="button" className="button-secondary" disabled={disabled || busy} onClick={() => void update(row, "DELETE")}>删除</button></div>}
    </article>;
  }
  const globalRows = relevant.filter((r) => r.scope === "GLOBAL" && r.status === "ACTIVE");
  const localRows = relevant.filter((r) => r.scope !== "GLOBAL" && r.status === "ACTIVE");
  const pending = relevant.filter((r) => r.status !== "ACTIVE");
  return <section className="planning-preferences" aria-label="规划偏好与约束"><h3>规划偏好与约束</h3><p className="car-hint">保留你说过的话和已确认的选择。选择本身不代表长期偏好。</p>{error && <p role="alert" className="car-risk">{error}</p>}
    {!relevant.length && <p>目前没有需要保留的偏好；可以在目标对话中直接说明。</p>}
    {globalRows.length > 0 && <div><h4>已确认、可复用的偏好</h4>{globalRows.map(item)}</div>}
    {localRows.length > 0 && <div><h4>当前目标的偏好与决定</h4>{localRows.map(item)}</div>}
    {pending.length > 0 && <details open={pending.some((r) => r.status === "REVIEW")}><summary>待核实或待复核（{pending.length}）</summary>{pending.map(item)}</details>}
  </section>;
}
