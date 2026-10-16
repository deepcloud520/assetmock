import BigNumber from "bignumber.js";

export const calculatorUnits = ["CNY_MINOR", "COUNT", "MONTHS", "RATIO", "DIMENSIONLESS"] as const;
export type CalculatorUnit = typeof calculatorUnits[number];
export const calculatorOperations = ["ADD", "SUBTRACT", "MULTIPLY", "DIVIDE", "MIN", "MAX", "POWER"] as const;
export type CalculatorOperation = typeof calculatorOperations[number];
export const calculatorRoundingModes = ["NONE", "CEIL", "FLOOR", "HALF_UP"] as const;
export type CalculatorRoundingMode = typeof calculatorRoundingModes[number];

export type CalculatorFact = { id: string; label: string; value: string; unit: CalculatorUnit; source: "USER_CONFIRMED" | "CALCULATED" };
export type CalculatorOperand = { type: "FACT"; id: string } | { type: "STEP"; id: string } | { type: "LITERAL"; value: string; unit: CalculatorUnit };
export type CalculatorStep = { id: string; label: string; operation: CalculatorOperation; operands: CalculatorOperand[]; unit: CalculatorUnit; rounding?: CalculatorRoundingMode; decimalPlaces?: number };
export type CalculatorResult = { id: string; label: string; operation: CalculatorOperation; value: string; unit: CalculatorUnit; source: "CALCULATED" };

export class CalculatorError extends Error {}

function validId(id: string) {
  if (!/^[a-z][a-z0-9_]{0,63}$/.test(id)) throw new CalculatorError("计算标识不合法");
}

function number(value: string, label: string) {
  const result = new BigNumber(value);
  if (!result.isFinite()) throw new CalculatorError(`${label}不是有限数字`);
  return result;
}

function rounded(value: BigNumber, mode: CalculatorRoundingMode, places: number) {
  if (!Number.isInteger(places) || places < 0 || places > 12) throw new CalculatorError("小数位数必须在0到12之间");
  if (mode === "NONE") return value;
  const rounding = mode === "CEIL" ? BigNumber.ROUND_CEIL : mode === "FLOOR" ? BigNumber.ROUND_FLOOR : BigNumber.ROUND_HALF_UP;
  return value.decimalPlaces(places, rounding);
}

type ResolvedOperand = { value: BigNumber; unit: CalculatorUnit };

function resolveOperand(operand: CalculatorOperand, facts: Map<string, CalculatorFact>, results: Map<string, CalculatorResult>): ResolvedOperand {
  if (operand.type === "LITERAL") return { value: number(operand.value, "常量"), unit: operand.unit };
  const found = operand.type === "FACT" ? facts.get(operand.id) : results.get(operand.id);
  if (!found) throw new CalculatorError(operand.type === "FACT" ? `缺少输入：${operand.id}` : `缺少前序结果：${operand.id}`);
  return { value: number(found.value, found.label), unit: found.unit };
}

function calculateStep(step: CalculatorStep, operands: ResolvedOperand[]) {
  if (["ADD", "SUBTRACT", "MIN", "MAX"].includes(step.operation) && operands.some((operand) => operand.unit !== step.unit)) throw new CalculatorError(`${step.label}的单位不一致`);
  if (step.operation === "POWER" && (operands.length !== 2 || !operands[1].value.isInteger() || operands[1].value.abs().gt(600))) throw new CalculatorError(`${step.label}的指数不合法`);
  const first = operands[0].value;
  const rest = operands.slice(1);
  switch (step.operation) {
    case "ADD": return rest.reduce((total, operand) => total.plus(operand.value), first);
    case "SUBTRACT": return rest.reduce((total, operand) => total.minus(operand.value), first);
    case "MULTIPLY": return rest.reduce((total, operand) => total.times(operand.value), first);
    case "DIVIDE": return rest.reduce((total, operand) => {
      if (operand.value.isZero()) throw new CalculatorError(`${step.label}不能除以零`);
      return total.dividedBy(operand.value);
    }, first);
    case "MIN": return rest.reduce((total, operand) => BigNumber.minimum(total, operand.value), first);
    case "MAX": return rest.reduce((total, operand) => BigNumber.maximum(total, operand.value), first);
    case "POWER": return first.exponentiatedBy(operands[1].value.toNumber());
  }
}

export function executeCalculator(facts: CalculatorFact[], steps: CalculatorStep[]): CalculatorResult[] {
  const factMap = new Map<string, CalculatorFact>();
  for (const fact of facts) {
    validId(fact.id);
    if (factMap.has(fact.id)) throw new CalculatorError(`重复输入：${fact.id}`);
    number(fact.value, fact.label);
    factMap.set(fact.id, fact);
  }
  const results = new Map<string, CalculatorResult>();
  for (const step of steps) {
    validId(step.id);
    if (results.has(step.id) || factMap.has(step.id)) throw new CalculatorError(`重复步骤：${step.id}`);
    if (step.operands.length < 2) throw new CalculatorError(`${step.label}至少需要两个输入`);
    const operands = step.operands.map((operand) => resolveOperand(operand, factMap, results));
    const value = calculateStep(step, operands);
    const result = rounded(value, step.rounding ?? "NONE", step.decimalPlaces ?? 8);
    if (!result.isFinite()) throw new CalculatorError(`${step.label}的结果不是有限数字`);
    results.set(step.id, { id: step.id, label: step.label, operation: step.operation, value: result.toFixed(), unit: step.unit, source: "CALCULATED" });
  }
  return [...results.values()];
}
