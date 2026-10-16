'use client';
import { useState } from 'react';
import type { LoanOffer, LoanResearch, SetupInput } from '@/domain/types';

export function LoanResearchPanel({ research, input, disabled, onApply }: {
  research: LoanResearch; input: SetupInput; disabled: boolean;
  onApply: (sourceId: string, rate: string, fee: number) => Promise<void>;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [rate, setRate] = useState('');
  const [fee, setFee] = useState('');
  const [accepted, setAccepted] = useState(false);
  const draft = research.drafts.find(d => d.sourceId === selected);
  const canApply = /^\d+(\.\d{1,4})?$/.test(rate) && Number(rate) <= 30
    && /^\d+(\.\d{1,2})?$/.test(fee) && Number(fee) <= 100000 && accepted;
  function select(id: string) {
    const extracted = research.drafts.find(d => d.sourceId === id);
    setSelected(id); setRate(extracted?.annualRatePercent ?? ''); setFee(extracted?.feeYuan?.toString() ?? ''); setAccepted(false);
  }
  return <section className="loan-research" aria-label="联网贷款资料">
    <h2>查到的购车资料</h2><p className="hint">{research.notice}</p>
    {research.documents.map(doc => <article className="search-result" key={doc.id}>
      <div className="source-meta">豆包搜索 Custom · {doc.site}</div>
      <h3><a href={doc.url} target="_blank" rel="noopener noreferrer">{doc.title}</a></h3>
      <p>{doc.snippet || doc.content.slice(0, 240) || '该页面没有提供摘要，请打开来源查看。'}</p>
      <small>检索：{new Date(doc.retrievedAt).toLocaleString('zh-CN')}{doc.publishedAt ? ` · 页面发布：${doc.publishedAt}` : ' · 页面发布日期未知'}</small>
      {doc.content && <details><summary>查看检索原文片段</summary><p className="source-content">{doc.content}</p></details>}
      <button className="secondary" disabled={disabled} onClick={() => select(doc.id)}>参考这份资料设定条件</button>
      {selected === doc.id && <div className="web-conditions">
        <h3>核对这次模拟的贷款条件</h3>
        <p className="hint">网页信息可能缺少费用或适用条件。空白项不会按零处理；可自行设定假设。这里只模拟等额本息。</p>
        {draft?.rateEvidence && <blockquote>利率依据：{draft.rateEvidence}</blockquote>}
        {draft?.feeEvidence && <blockquote>费用依据：{draft.feeEvidence}</blockquote>}
        <div className="fields"><label>年化名义利率（%）<input type="number" min="0" max="30" step="0.0001" placeholder="待确认，不是平息费率" value={rate} onChange={e => { setRate(e.target.value); setAccepted(false); }} /></label>
          <label>一次性贷款费用（元）<input type="number" min="0" max="100000" step="0.01" placeholder="无费用时请明确填 0" value={fee} onChange={e => { setFee(e.target.value); setAccepted(false); }} /></label></div>
        <p>首付 {input.downPaymentPercent}%，期限 {input.termMonths} 个月，沿用方案确认区的当前设置。</p>
        <label className="check"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />我确认将以上条件作为模拟假设，理解其并非本人可申请的报价。</label>
        <button className="primary" disabled={disabled || !canApply} onClick={() => void onApply(doc.id, rate, Number(fee))}>使用这些条件计算</button>
      </div>}
    </article>)}
  </section>;
}
export function OfferSource({ offer }: { offer: LoanOffer }) {
  return offer.sourceType === 'web_reference' && offer.sourceUrl
    ? <p className="hint">当前采用参考网页设定的模拟条件。<a href={offer.sourceUrl} target="_blank" rel="noopener noreferrer">查看来源</a>；检索于 {offer.retrievedAt?.slice(0, 10)}。不代表有效报价或授信结果。</p>
    : <p className="hint">当前采用团队构造的示例贷款资料，并非真实可申请报价。</p>;
}
