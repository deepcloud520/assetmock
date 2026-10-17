import { describe, expect, it } from "vitest";
import { formatMoneyInput, minorToYuan, yuanToMinor } from "./money-input";

describe("exact ledger money formatting", () => {
  it("preserves cents when displaying and resubmitting large amounts", () => {
    for (const minor of ["0", "1", "10", "100", "123456789", "9007199254740991"]) {
      expect(yuanToMinor(minorToYuan(minor))).toBe(minor);
    }
    expect(minorToYuan("9007199254740991")).toBe("90,071,992,547,409.91");
    expect(formatMoneyInput("90071992547409.91")).toBe("90,071,992,547,409.91");
  });

  it("normalizes valid input without changing its value", () => {
    expect(formatMoneyInput(" 001234.50 ")).toBe("1,234.5");
    expect(formatMoneyInput("1234.")).toBe("1,234");
    expect(formatMoneyInput(" ")).toBe("");
    expect(yuanToMinor("")).toBe("0");
    expect(yuanToMinor(null)).toBe("0");
    expect(minorToYuan("-101")).toBe("-1.01");
  });

  it("keeps invalid text visible and rejects it on submission", () => {
    for (const value of ["1.234", "1e3", "-1", "abc"]) {
      expect(formatMoneyInput(value)).toBe(value);
      expect(() => yuanToMinor(value)).toThrow();
    }
  });
});
