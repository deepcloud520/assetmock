import { z } from 'zod';

/**
 * AI 解读：**接口先定死，模型后接**。
 *
 * 现在渲染层拿到的形状和将来接模型时一模一样，只是 status 为 RESERVED：
 * 页面先把这块位置留出来（骨架 + 待接入说明），接模型时只改这一个文件，
 * 页面、路由、agent 工具都不用动。
 *
 * 约束（和卡片、参数同一套口径）：
 * - 不许出现概率/最坏/预测/将会这类词，只能说"在 N 条模拟里有 M 条"；
 * - 每个结论必须带 evidenceIds（params.v1 / cards.v1 / WORLDLINE:W-xxx）；
 * - 不许给出买卖建议，只描述"发生了什么、为什么、下一步该关注什么"。
 */

export const WORLDLINE_INTERPRET_VERSION = 'wl-interpret.0.1.0';

export const interpretationStatus = ['RESERVED', 'OK', 'FAILED'] as const;
export type InterpretationStatus = (typeof interpretationStatus)[number];

export interface InterpretationSection {
  /** 小标题：发生了什么 / 为什么会这样 / 接下来关注什么 */
  title: string;
  /** 一段话；已接入模型时由模型填写 */
  body: string;
  /** params.v1 参数名、CardPlan 卡片 id、或 WORLDLINE:W-xxx */
  evidenceIds: string[];
}

export interface Interpretation {
  status: InterpretationStatus;
  /** 一句话结论（页面上放在标题下面） */
  headline: string;
  sections: InterpretationSection[];
  /** 模型与提示词版本，便于复现 */
  model: string | null;
  promptVersion: string;
  /** 生成时间；RESERVED 时为 null */
  generatedAt: string | null;
  /** 这次解读读到的输入摘要，页面直接展示，避免"AI 到底看了什么"说不清 */
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
  /** 未接入时的说明 */
  note: string;
}

export const interpretInputSchema = z.object({
  goalId: z.string().nullable().optional().default(null),
  target: z.enum(['car', 'home']),
  sourceSignature: z.string().min(1),
  n: z.number().int().min(20).max(600),
  months: z.number().int().min(1).max(360),
  seed: z.number().int().min(0),
  paramsVersion: z.string().min(1),
  cardsVersion: z.string().nullable().optional().default(null),
  cardPlanId: z.string().nullable().optional().default(null),
  sampleId: z.string().min(1),
  bands: z.object({ bad: z.number().int(), tight: z.number().int(), ok: z.number().int() }),
});

export type InterpretInput = z.infer<typeof interpretInputSchema>;

/** 页面骨架用的占位解读：形状与将来一致，内容如实说明"还没接模型" */
export function reservedInterpretation(input: InterpretInput): Interpretation {
  return {
    status: 'RESERVED',
    headline: `这次是 ${input.n} 条世界线里 ${input.bands.bad} 条出现资金不足，先看分布与卡片，文字解读待接入。`,
    sections: [
      {
        title: '发生了什么',
        body: '',
        evidenceIds: [`WORLDLINE:${input.sampleId}`],
      },
      {
        title: '为什么会这样',
        body: '',
        evidenceIds: [],
      },
      {
        title: '接下来关注什么',
        body: '',
        evidenceIds: [],
      },
    ],
    model: null,
    promptVersion: WORLDLINE_INTERPRET_VERSION,
    generatedAt: null,
    inputs: {
      n: input.n,
      months: input.months,
      seed: input.seed,
      paramsVersion: input.paramsVersion,
      cardsVersion: input.cardsVersion ?? null,
      cardPlanId: input.cardPlanId ?? null,
      sampleId: input.sampleId,
      bands: input.bands,
    },
    note: 'AI 解读的接口形状已定：POST /api/worldlines/interpret 返回 headline + sections + inputs。接上模型后只填 sections，页面不用改。',
  };
}
