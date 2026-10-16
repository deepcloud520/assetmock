"use client";

import { Check, ChevronDown, LoaderCircle, RotateCcw, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type PromptKey = "diagnosis" | "fourAccount" | "planning" | "actionReport";
type PromptGroup = "diagnosis" | "planning";

type PromptSetting = {
  key: PromptKey;
  label: string;
  group: PromptGroup;
  description: string;
  defaultPrompt: string;
  basePrompt: string;
  isCustomized: boolean;
  finalSystemPrompt: string;
  outputSchema: string | null;
  provider: string;
};

const groupKeys: Record<PromptGroup, PromptKey[]> = {
  diagnosis: ["diagnosis", "fourAccount"],
  planning: ["planning", "actionReport"],
};

export function PromptSidebar({ workspaceId, group, onClose }: { workspaceId: string; group: PromptGroup; onClose: () => void }) {
  const [settings, setSettings] = useState<PromptSetting[] | null>(null);
  const [activeKey, setActiveKey] = useState<PromptKey>(groupKeys[group][0]);
  const [drafts, setDrafts] = useState<Partial<Record<PromptKey, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const controller = new AbortController();
    async function load() {
      try {
        const response = await fetch("/api/prompt-settings", { headers: { "X-Workspace-Id": workspaceId }, signal: controller.signal });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error ?? "读取提示词失败");
        setSettings(body as PromptSetting[]);
      } catch (loadError) {
        if (!controller.signal.aborted) setError(loadError instanceof Error ? loadError.message : "读取提示词失败");
      }
    }
    void load();
    return () => controller.abort();
  }, [workspaceId]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const current = settings?.find((item) => item.key === activeKey);
  const draft = current ? drafts[activeKey] ?? current.basePrompt : "";
  const dirty = Boolean(current && draft !== current.basePrompt);

  async function confirm() {
    if (!current || !draft.trim() || !dirty) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const response = await fetch("/api/prompt-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Workspace-Id": workspaceId },
        body: JSON.stringify({ key: activeKey, prompt: draft === current.defaultPrompt ? null : draft }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? "保存提示词失败");
      setSettings(body as PromptSetting[]);
      setDrafts((previous) => ({ ...previous, [activeKey]: draft }));
      setSaved(true);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "保存提示词失败");
    } finally {
      setSaving(false);
    }
  }

  return <div className="prompt-sidebar-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="prompt-sidebar" role="dialog" aria-modal="true" aria-labelledby="prompt-sidebar-title">
      <header className="prompt-sidebar-header">
        <div><p className="prompt-sidebar-eyebrow">PROMPT STUDIO</p><h2 id="prompt-sidebar-title">提示词调试</h2><p>编辑基础提示词，确认后用于下一次生成。</p></div>
        <button ref={closeRef} type="button" className="prompt-sidebar-close" aria-label="收起提示词侧边栏" onClick={onClose}><X size={20} /></button>
      </header>

      <nav className="prompt-sidebar-tabs" aria-label="选择提示词">
        {groupKeys[group].map((key) => {
          const item = settings?.find((setting) => setting.key === key);
          return <button key={key} type="button" className={activeKey === key ? "active" : ""} aria-pressed={activeKey === key} disabled={saving} onClick={() => { setActiveKey(key); setError(""); setSaved(false); }}>
            {item?.label ?? (key === "fourAccount" ? "四账户配置" : key === "planning" ? "方案说明" : key === "actionReport" ? "行动报告" : "财富诊断")}
            {item?.isCustomized && <span className="prompt-sidebar-custom-dot" aria-label="已自定义" />}
          </button>;
        })}
      </nav>

      <div className="prompt-sidebar-body">
        {!settings && !error && <div className="prompt-sidebar-loading"><LoaderCircle className="animate-spin" size={18} />正在读取提示词…</div>}
        {current && <>
          <div className="prompt-sidebar-section-heading"><div><h3>{current.label}</h3><p>{current.description}</p></div><span className={current.isCustomized ? "prompt-sidebar-status custom" : "prompt-sidebar-status"}>{current.isCustomized ? "自定义已生效" : "系统默认"}</span></div>
          <label className="prompt-sidebar-label" htmlFor="prompt-base-editor">基础提示词 · 可编辑</label>
          <textarea id="prompt-base-editor" className="prompt-sidebar-editor" value={draft} maxLength={20_000} spellCheck={false} disabled={saving} onChange={(event) => { setDrafts((previous) => ({ ...previous, [activeKey]: event.target.value })); setSaved(false); }} />
          <div className="prompt-sidebar-editor-meta"><span>{draft.length.toLocaleString("zh-CN")} / 20,000 字</span><button type="button" disabled={saving || draft === current.defaultPrompt} onClick={() => { setDrafts((previous) => ({ ...previous, [activeKey]: current.defaultPrompt })); setSaved(false); }}><RotateCcw size={14} />填入默认提示词</button></div>
          {error && <p className="prompt-sidebar-error" role="alert">{error}</p>}
          <div className="prompt-sidebar-actions"><span>{dirty ? "有未保存的修改" : saved ? "新提示词已生效" : "当前内容已生效"}</span><button type="button" className="button-primary" disabled={!dirty || !draft.trim() || saving} onClick={() => void confirm()}>{saving ? <LoaderCircle className="animate-spin" size={16} /> : <Check size={16} />}确认并生效</button></div>
          <section className="prompt-sidebar-preview" aria-labelledby="prompt-final-title"><div><h3 id="prompt-final-title">最终发送内容 · 只读</h3><span>{current.provider}</span></div><p>下方显示当前已生效的系统内容。运行时日期和时间会在实际生成时更新。</p><pre>{current.finalSystemPrompt}</pre>
            {current.outputSchema && <details><summary>随请求发送的 JSON 输出格式 <ChevronDown size={14} /></summary><pre>{current.outputSchema}</pre></details>}
          </section>
        </>}
        {!current && error && <p className="prompt-sidebar-error" role="alert">{error}</p>}
      </div>
    </aside>
  </div>;
}
