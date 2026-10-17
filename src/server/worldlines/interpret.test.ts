import { describe, expect, it } from 'vitest';
import { interpretInputSchema, reservedInterpretation, WORLDLINE_INTERPRET_VERSION } from './interpret';

const input = {
  goalId: null,
  target: 'car' as const,
  sourceSignature: 'sig',
  n: 200,
  months: 60,
  seed: 42,
  paramsVersion: 'params.v1',
  cardsVersion: 'cards.v1',
  cardPlanId: 'plan.default',
  sampleId: 'W-087',
  bands: { bad: 31, tight: 18, ok: 151 },
};

describe('AI 解读的预留接口', () => {
  it('输入契约可以校验', () => {
    const parsed = interpretInputSchema.parse(input);
    expect(parsed.n).toBe(200);
    expect(parsed.sampleId).toBe('W-087');
  });

  it('占位解读的形状和将来接模型时一致', () => {
    const result = reservedInterpretation(interpretInputSchema.parse(input));
    expect(result.status).toBe('RESERVED');
    expect(result.sections.map(section => section.title)).toEqual(['发生了什么', '为什么会这样', '接下来关注什么']);
    expect(result.model).toBeNull();
    expect(result.generatedAt).toBeNull();
    expect(result.promptVersion).toBe(WORLDLINE_INTERPRET_VERSION);
    expect(result.inputs.n).toBe(200);
    expect(result.inputs.bands.bad).toBe(31);
    expect(result.inputs.sampleId).toBe('W-087');
  });

  it('结论句只用"在 N 条里 M 条"，不出现概率/预测口径', () => {
    const result = reservedInterpretation(interpretInputSchema.parse(input));
    for (const word of ['概率', '最坏', '预测', '将会', '大概率']) expect(result.headline).not.toContain(word);
    expect(result.headline).toContain('200');
    expect(result.headline).toContain('31');
  });

  it('每个小节都留了依据位', () => {
    const result = reservedInterpretation(interpretInputSchema.parse(input));
    expect(result.sections[0].evidenceIds[0]).toBe('WORLDLINE:W-087');
    for (const section of result.sections) expect(Array.isArray(section.evidenceIds)).toBe(true);
  });
});
