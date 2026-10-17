'use client';

import { useEffect, useState } from 'react';

type Interpretation = {
  status: 'DRAFT' | 'OK' | 'FAILED';
  headline: string;
  sections: Array<{ title: string; body: string; evidenceIds: string[] }>;
  model: string | null;
  promptVersion: string;
  note: string;
  inputs: { n: number; months: number; seed: number; sampleId: string; cardPlanId: string | null };
};

/**
 * AI 解读（规则草稿 + 预留模型位）。
 *
 * 用**和推演完全相同的入参**重算一次，所以文字里的数字和页面上的数字一定对得上；
 * 模型接入后只替换三个小节的正文，这里不用改。
 */
export function InterpretationPanel({ workspaceId, payload }: { workspaceId: string; payload?: Record<string, unknown> }) {
  const [data, setData] = useState<Interpretation>();
  const [failed, setFailed] = useState('');

  useEffect(() => {
    if (!payload) return;
    let active = true;
    void fetch('/api/worldlines/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': workspaceId },
      body: JSON.stringify(payload),
    })
      .then(response => (response.ok ? response.json() : response.json().then((error: { error?: string }) => Promise.reject(new Error(error.error ?? `HTTP ${response.status}`)))))
      .then((next: Interpretation) => { if (active) setData(next); })
      .catch(error => { if (active) setFailed(error instanceof Error ? error.message : '解读不可用'); });
    return () => { active = false; };
  }, [workspaceId, payload]);

  if (failed) return <section className="wl-interpret">
    <h3>AI 解读</h3>
    <p className="wl-hint">解读暂时不可用（{failed}），世界线结果本身不受影响。</p>
  </section>;

  return <section className="wl-interpret">
    <h3>
      AI 解读
      {data && <em className="wl-badge">{data.status === 'DRAFT' ? '规则草稿 · 模型待接入' : data.status === 'OK' ? '模型解读' : '生成失败'}</em>}
    </h3>
    {!data
      ? <p className="wl-hint">正在根据这次结果生成解读…</p>
      : <>
        <p className="wl-interpret-headline">{data.headline}</p>
        <ol className="wl-interpret-sections">
          {data.sections.map(section => <li key={section.title}>
            <b>{section.title}</b>
            <span>{section.body}</span>
            {section.evidenceIds.length > 0 && <small className="wl-interpret-evidence">依据 {section.evidenceIds.join(' · ')}</small>}
          </li>)}
        </ol>
        <p className="wl-meta">
          读了：{data.inputs.n} 条 × {data.inputs.months} 月 · 种子 {data.inputs.seed} · 单线 {data.inputs.sampleId}
          {data.inputs.cardPlanId ? ` · 卡组 ${data.inputs.cardPlanId}` : ''} · 提示词 {data.promptVersion}
        </p>
        <p className="wl-hint">{data.note}</p>
      </>}
  </section>;
}
