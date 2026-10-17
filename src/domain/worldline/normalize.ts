/**
 * 生活费与租金的口径归一。
 *
 * 引擎（settle）按 `日常开销 = 月生活费 − 租金` 结算，所以：
 * - 用户填「生活费含租金」时，租金必须 ≤ 生活费；
 * - 但很多人填的「月生活费」是**不含租金**的日常开销（租金单独算）。
 *
 * 判断办法很简单：租金比生活费还大，只可能是"不含租金"那种填法。
 * 这时把生活费加上租金交给引擎，日常开销就还原成用户填的那个数，门槛也就正常了。
 * 两种口径都能算，不再拿一句规则把用户挡回去。
 */
export function normalizeLiving(livingMinor: number, rentMinor: number): { livingMinor: number; notice: string | null } {
  if (!Number.isFinite(livingMinor) || !Number.isFinite(rentMinor) || livingMinor < 0 || rentMinor < 0) {
    return { livingMinor, notice: null };
  }
  if (rentMinor > livingMinor) {
    const yuan = (value: number) => (value / 100).toLocaleString('zh-CN', { maximumFractionDigits: 0 });
    return {
      livingMinor: livingMinor + rentMinor,
      notice: `按「月生活费不含租金」理解：日常开销 ${yuan(livingMinor)} 元 + 租金 ${yuan(rentMinor)} 元 = 生活费 ${yuan(livingMinor + rentMinor)} 元`,
    };
  }
  return { livingMinor, notice: null };
}
