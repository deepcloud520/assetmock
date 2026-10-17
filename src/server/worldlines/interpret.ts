import type { RenderModel } from '@/domain/worldline/render-model';

/**
 * AI 解读：**接口先定死，先给规则草稿，模型后接**。
 *
 * 草稿完全由这一次推演的结果推出来（确定性，同 seed 同文案），不是编的：
 * - 每条结论都带 evidenceIds（WORLDLINE:W-xxx / params 参数 / 卡片 id）
 * - 口径与卡片一致：禁"概率/最坏/预测/将会"，只能说"在 N 条模拟里有 M 条"
 * - 不给买卖建议，只讲"发生了什么 / 为什么 / 值得先确认什么"
 *
 * 接模型时：保留这个函数作为兜底（模型超时/失败就用它），模型只替换 sections[].body。
 */

export const WORLDLINE_INTERPRET_VERSION = 'wl-interpret.0.2.0';

export const interpretationStatus = ['DRAFT', 'OK', 'FAILED'] as const;
export type InterpretationStatus = (typeof interpretationStatus)[number];

export interface InterpretationSection {
  /** 小标题：发生了什么 / 为什么会这样 / 接下来关注什么 */
  title: string;
  body: string;
  /** WORLDLINE:W-xxx、params 参数名、或卡片 id */
  evidenceIds: string[];
}

export interface Interpretation {
  status: InterpretationStatus;
  headline: string;
  sections: InterpretationSection[];
  model: string | null;
  promptVersion: string;
  generatedAt: string | null;
  inputs: {
    n: number;
    months: number;
    seed: number;
    paramsVersion: string;
    cardsVersion: string | null;
    cardPlanId: string | null;
    sampleId: string;
    bands: { bad: number; tight: number; ok: number };
  };
  note: string;
}

const yuan = (minor: number) => `${(minor / 100).toLocaleString('zh-CN', { maximumFractionDigits: 0 })} 元`;
const percent = (part: number, total: number) => (total ? Math.round((part / total) * 100) : 0);

/** 由这次结果生成一份能看的草稿（模型接入前）；同一份结果永远得到同一段话 */
export function draftInterpretation(model: RenderModel): Interpretation {
  const { meta, bands, sample, strategies, candidates, provenance } = model;
  const total = meta.n;
  const floorA = strategies[0]?.floorMinor ?? 0;
  const floorB = strategies[1]?.floorMinor ?? 0;
  const allMinima = Object.values(model.minUsables).flat();
  const lowest = allMinima.length ? Math.min(...allMinima) : 0;
  const highest = allMinima.length ? Math.max(...allMinima) : 0;

  const failed = Object.values(sample.byStrategy).filter(item => item.firstShortfall);
  const firstMonth = Math.min(...Object.values(sample.byStrategy).map(item => item.firstShortfall?.month ?? Number.POSITIVE_INFINITY));
  const shocks = Array.from(new Set(candidates.map(candidate => candidate.premise).filter(premise => premise && !premise.includes('没有发生冲击')))).slice(0, 3);
  const shortPremise = sample.premise || '没有明显的冲击事件';

  const headline = bands.bad > 0
    ? `在 ${total} 条模拟里，${bands.bad} 条出现资金不足（${percent(bands.bad, total)}%），${bands.tight} 条紧巴巴；单看 ${sample.id} 这条，${failed.length ? `第 ${firstMonth} 个月开始不够` : '全程没断'}。`
    : `在 ${total} 条模拟里，没有一条出现资金不足，${bands.tight} 条紧巴巴；单看 ${sample.id} 这条，${failed.length ? `第 ${firstMonth} 个月开始不够` : '全程没断'}。`;

  const sections: InterpretationSection[] = [
    {
      title: '发生了什么',
      body: `这段经历是「${shortPremise}」。两条走法的最低值分别落在 ${yuan(sample.byStrategy[strategies[0]?.id ?? 'a']?.minUsable ?? 0)} 与 ${yuan(sample.byStrategy[strategies[1]?.id ?? 'b']?.minUsable ?? 0)}；把 ${total} 条放在一起看，最低值从 ${yuan(lowest)} 到 ${yuan(highest)}。`,
      evidenceIds: [`WORLDLINE:${sample.id}`, 'params.v1'],
    },
    {
      title: '为什么会这样',
      body: `分档的门槛是「3 个月的固定流出 + 月供」：A 是 ${yuan(floorA)}、B 是 ${yuan(floorB)}。这一档里比较常见的起因是 ${shocks.length ? shocks.join('；') : '收入中断与投资下跌'}。剩下的差别来自每次事件的时机：同样一场冲击，早一个月和晚一个月，留下的余量差很多。`,
      evidenceIds: ['params.v1', ...candidates.slice(0, 2).map(candidate => `WORLDLINE:${candidate.id}`)],
    },
    {
      title: '接下来关注什么',
      body: `第一，看首付之后还剩多少现金（这次 A 是 ${yuan(sample.byStrategy[strategies[0]?.id ?? 'a']?.minUsable ?? 0)} 的最低值）；第二，看月供占月收入的比例；第三，看 ${provenance.length} 条假设里由公开数据推得的部分。这三件事比单看平均结果更有用。`,
      evidenceIds: ['params.v1', `WORLDLINE:${sample.id}`],
    },
  ];

  return {
    status: 'DRAFT',
    headline,
    sections,
    model: null,
    promptVersion: WORLDLINE_INTERPRET_VERSION,
    generatedAt: new Date().toISOString(),
    inputs: {
      n: meta.n,
      months: meta.months,
      seed: meta.seed,
      paramsVersion: meta.paramsVersion,
      cardsVersion: meta.cardsVersion ?? null,
      cardPlanId: meta.cardPlanId ?? null,
      sampleId: sample.id,
      bands,
    },
    note: '这是规则草稿：数字来自本次结果，句子由模板生成；模型接入后只替换三个小节的正文。',
  };
}
