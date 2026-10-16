import { describe, expect, it } from "vitest";
import { executeCalculator } from "./future-planning-calculator";
import type { CalculatorOperation, CalculatorStep } from "./future-planning-calculator";
import { executeFormulaTemplates } from "./future-planning-formulas";

describe("future planning calculator", () => {
  function step(operation: CalculatorOperation, values: string[]): CalculatorStep {
    return { id: "result", label: "计算", operation, unit: "COUNT", operands: values.map((value) => ({ type: "LITERAL", value, unit: "COUNT" })) };
  }

  it.each<[CalculatorOperation, string[], string]>([
    ["ADD", ["10", "2", "3"], "15"], ["SUBTRACT", ["10", "2", "3"], "5"],
    ["MULTIPLY", ["10", "2", "3"], "60"], ["DIVIDE", ["12", "2", "3"], "2"],
    ["MIN", ["10", "2", "3"], "2"], ["MAX", ["10", "2", "3"], "10"],
    ["POWER", ["2", "-2"], "0.25"],
  ])("evaluates %s in operand order", (operation, values, expected) => {
    expect(executeCalculator([], [step(operation, values)])[0].value).toBe(expected);
  });

  it.each([ ["CEIL", "1.67"], ["FLOOR", "1.66"], ["HALF_UP", "1.67"], ["NONE", "1.66666666666666666667"] ] as const)("applies %s rounding", (rounding, expected) => {
    expect(executeCalculator([], [{ ...step("DIVIDE", ["5", "3"]), rounding, decimalPlaces: 2 }])[0].value).toBe(expected);
  });

  it("resolves earlier results and rejects invalid calculations", () => {
    const first = step("ADD", ["2", "3"]);
    expect(executeCalculator([], [first, { ...step("MULTIPLY", ["0", "2"]), id: "next", operands: [{ type: "STEP", id: "result" }, { type: "LITERAL", value: "2", unit: "COUNT" }] }])[1].value).toBe("10");
    expect(() => executeCalculator([], [step("DIVIDE", ["2", "0"])])).toThrow("不能除以零");
    expect(() => executeCalculator([], [step("POWER", ["2", "0.5"])])).toThrow("指数不合法");
    expect(() => executeCalculator([], [first, first])).toThrow("重复步骤");
    expect(() => executeCalculator([], [{ ...first, unit: "CNY_MINOR" }])).toThrow("单位不一致");
    expect(() => executeCalculator([], [{ ...first, operands: [{ type: "FACT", id: "missing" }, first.operands[0]] }])).toThrow("缺少输入");
    expect(() => executeCalculator([], [{ ...first, operands: [{ type: "STEP", id: "later" }, first.operands[0]] }])).toThrow("缺少前序结果");
  });

  it("uses bignumber-backed structured steps for exact decimal arithmetic", () => {
    const result = executeCalculator([
      { id: "a", label: "a", value: "0.1", unit: "RATIO", source: "USER_CONFIRMED" },
      { id: "b", label: "b", value: "0.2", unit: "RATIO", source: "USER_CONFIRMED" },
    ], [{ id: "sum", label: "精确相加", operation: "ADD", operands: [{ type: "FACT", id: "a" }, { type: "FACT", id: "b" }], unit: "RATIO" }]);
    expect(result).toEqual([expect.objectContaining({ id: "sum", value: "0.3", source: "CALCULATED" })]);
  });

  it("runs financial formulas as templates over the generic calculator", () => {
    const result = executeFormulaTemplates([
      { id: "target_amount_minor", label: "目标金额", value: "1200000", unit: "CNY_MINOR", source: "USER_CONFIRMED" },
      { id: "prepared_amount_minor", label: "已准备金额", value: "200000", unit: "CNY_MINOR", source: "USER_CONFIRMED" },
      { id: "remaining_months", label: "剩余月数", value: "10", unit: "COUNT", source: "CALCULATED" },
      { id: "monthly_saving_capacity_minor", label: "月结余", value: "60000", unit: "CNY_MINOR", source: "CALCULATED" },
    ], ["goal_funding"]);
    expect(result.calculations).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "goal_gap", value: "1000000" }),
      expect.objectContaining({ id: "monthly_required", value: "100000" }),
      expect.objectContaining({ id: "monthly_gap", value: "40000" }),
    ]));
  });

  it("does not execute a template when it lacks required facts", () => {
    const result = executeFormulaTemplates([], ["home_initial_fund"]);
    expect(result.calculations).toEqual([]);
    expect(result.missingInputs).toHaveLength(5);
  });
});
