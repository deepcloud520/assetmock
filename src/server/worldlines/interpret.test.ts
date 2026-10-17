import { describe, expect, it } from 'vitest';
import { draftInterpretation, WORLDLINE_INTERPRET_VERSION } from './interpret';
import type { RenderModel } from '@/domain/worldline/render-model';

const model = {
  meta: {
    seed: 42, n: 200, months: 60, engineVersion: 'wl-0.1.0', worldlineRulesVersion: 'wl-rules.0.1.0',
    v2RulesVersion: 'v2', paramsVersion: 'params.v1', cardsVersion: 'cards.v1', cardPlanId: 'plan.default',
    dataStatus: 'OK', claim: '在 200 条模拟里，31 条出现资金不足',
  },
  bands: { bad: 31, tight: 18, ok: 151 },
  strategies: [
    { id: 'a', label: '全款', floorMinor: 3_150_000, p5: -1_000_000, p50: 8_000_000, p90: 9_000_000, band: 'ok' },
    { id: 'b', label: '低首付', floorMinor: 4_427_700, p5: 200_000, p50: 9_000_000, p90: 9_500_000, band: 'ok' },
  ],
  minUsables: { a: [-1_855_000, 4_250_000], b: [-1_349_400, 1_166_730] },
  quantilesByMonth: { a: [], b: [] },
  candidates: [
    { id: 'W-087', band: 'tight', tier: 'middle', label: '中', premise: '第 23 月投资下跌', profileLabel: '', series: {}, byStrategy: { a: { minBalanceMinor: 4_250_000 }, b: { minBalanceMinor: 1_166_730 } } },
    { id: 'W-012', band: 'bad', tier: 'worst', label: '劣', premise: '第 7 月收入中断', profileLabel: '', series: {}, byStrategy: { a: { minBalanceMinor: -1_855_000 }, b: { minBalanceMinor: -1_349_400 } } },
  ],
  sample: {
    id: 'W-087', tier: 'middle', label: '中', premise: '第 23 月投资下跌',
    events: [{ month: 23, kind: 'marketDrop', title: '投资下跌' }],
    series: { a: [1, 2], b: [1, 2] },
    byStrategy: {
      a: { label: '全款', floorMinor: 3_150_000, minUsable: 4_250_000, band: 'ok', firstShortfall: null },
      b: { label: '低首付', floorMinor: 4_427_700, minUsable: 1_166_730, band: 'tight', firstShortfall: { month: 31, amountMinor: 20_000 } },
    },
  },
  provenance: [{ param: 'market.dropRate', label: '投资下跌', basis: 'PRESS_HYPOTHESIS', sourceQuality: 'THIRD_PARTY', value: '1' }],
  metaExtra: {},
} as unknown as RenderModel;

describe('AI 解读的规则草稿', () => {
  it('三个小节都有正文，不是占位', () => {
    const draft = draftInterpretation(model);
    expect(draft.status).toBe('DRAFT');
    expect(draft.sections).toHaveLength(3);
    for (const section of draft.sections) expect(section.body.length).toBeGreaterThan(10);
    expect(draft.sections.map(section => section.title)).toEqual(['发生了什么', '为什么会这样', '接下来关注什么']);
  });

  it('结论用"在 N 条里有 M 条"，并带上真实数字', () => {
    const draft = draftInterpretation(model);
    expect(draft.headline).toContain('200');
    expect(draft.headline).toContain('31');
    expect(draft.headline).toContain('W-087');
    for (const word of ['概率', '最坏', '预测', '将会', '大概率']) expect(draft.headline).not.toContain(word);
  });

  it('每个小节都带依据位', () => {
    const draft = draftInterpretation(model);
    for (const section of draft.sections) expect(section.evidenceIds.length).toBeGreaterThan(0);
    expect(draft.sections[0].evidenceIds).toContain('WORLDLINE:W-087');
  });

  it('同一份结果永远得到同一段话（时间戳除外）', () => {
    const first = draftInterpretation(model);
    const second = draftInterpretation(model);
    expect(second.headline).toBe(first.headline);
    expect(second.sections.map(section => section.body)).toEqual(first.sections.map(section => section.body));
    expect(first.promptVersion).toBe(WORLDLINE_INTERPRET_VERSION);
  });
});
