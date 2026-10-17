'use client';

import { useEffect, useState } from 'react';
import type { RenderModel } from '@/domain/worldline/render-model';

/** 与 src/server/worldlines/interpret.ts 的返回形状一致（只做类型引用，不打进客户端） */
type Interpretation = {
  status: 'RESERVED' | 'OK' | 'FAILED';
  headline: string;
  sections: Array<{ title: string; body: string; evidenceIds: string[] }>;
  model: string | null;
  promptVersion: string;
  note: string;
  inputs: { n: number; months: number; seed: number; sampleId: string; cardPlanId: string | null };
};

/**
 * AI 解读位（预留）。
 *
 * 现在拿到的是 RESERVED 骨架：标题、三个小节的标题、以及"这次读了哪些输入"。
 * 接上模型后后端只把 sections.body 填上，这里不用改一行。
 */
export function InterpretationPanel({ workspaceId, model }: { workspaceId: string; model: RenderModel }) {
  const [data, setData] = useState<Interpretation>();
  const [failed, setFailed] = useState('');

  useEffect(() => {
    let active = true;
    void fetch('/api/worldlines/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Workspace-Id': workspaceId },
      body: JSON.stringify({
        goalId: null,
        target: model.meta.months > 120 ? 'home' : 'car',
        sourceSignature: 'from-run',
        n: model.meta.n,
        months: model.meta.months,
        seed: model.meta.seed,
        paramsVersion: model.meta.paramsVersion,
        cardsVersion: model.meta.cardsVersion ?? null,
        cardPlanId: model.meta.cardPlanId ?? null,
        sampleId: model.sample.id,
        bands: model.bands,
      }),
    })
      .then(response => (response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`))))
      .then((payload: Interpretation) => { if (active) setData(payload); })
      .catch(error => { if (active) setFailed(error instanceof Error ? error.message : '解读不可用'); });
    return () => { active = false; };
  }, [workspaceId, model]);

  if (failed) return <section className="wl-interpret">
    <h3>AI 解读</h3>
    <p className="wl-hint">解读接口暂时不可用（{failed}），世界线结果本身不受影响。</p>
  </section>;

  return <section className="wl-interpret">
    <h3>AI 解读{data && data.status !== 'OK' ? <em className="wl-badge">待接入</em> : null}</h3>
    {!data
      ? <p className="wl-hint">正在准备解读…</p>
      : <>
        <p className="wl-interpret-headline">{data.headline}</p>
        <ol className="wl-interpret-sections">
          {data.sections.map(section => <li key={section.title}>
            <b>{section.title}</b>
            <span>{section.body || '接上模型后在这里写这段。'}</span>
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
