import { describe, expect, it } from 'vitest';
import { normalizeLiving } from './normalize';

describe('生活费 / 租金口径归一', () => {
  it('租金 ≤ 生活费：按填写值直接用', () => {
    const result = normalizeLiving(1_400_000, 400_000);
    expect(result.livingMinor).toBe(1_400_000);
    expect(result.notice).toBeNull();
  });

  it('租金 > 生活费：按"生活费不含租金"理解，把租金加回去', () => {
    const result = normalizeLiving(1_000_000, 1_500_000);
    expect(result.livingMinor).toBe(2_500_000);
    expect(result.notice).toContain('月生活费不含租金');
    expect(result.notice).toContain('10,000');
    expect(result.notice).toContain('15,000');
  });

  it('归一后引擎算出的日常开销等于用户填的生活费', () => {
    const living = 1_000_000;
    const rent = 1_500_000;
    const normalized = normalizeLiving(living, rent).livingMinor;
    expect(normalized - rent).toBe(living);
  });

  it('异常输入不制造负数', () => {
    expect(normalizeLiving(Number.NaN, 1).livingMinor).toBeNaN();
    expect(normalizeLiving(-1, 1).livingMinor).toBe(-1);
  });
});
