import { describe, expect, it } from "vitest";
import { formatPlanningText } from "./format-planning-text";

describe("formatPlanningText", () => {
  it("adds separators to amounts in Chinese planning sentences", () => {
    expect(formatPlanningText("目标1000000元，每月投入12000元，缺口796000元"))
      .toBe("目标1,000,000元，每月投入12,000元，缺口796,000元");
  });

  it("keeps dates, existing separators, decimals, and short counts readable", () => {
    expect(formatPlanningText("2028年2月到期；2028-02-25T16:03:09.385Z；已存1,000,000元；需12000.50元，14天内"))
      .toBe("2028年2月到期；2028-02-25T16:03:09.385Z；已存1,000,000元；需12,000.50元，14天内");
  });

  it("formats large negative values without altering identifiers", () => {
    expect(formatPlanningText("净结余-120000元，编号PLAN_12345，比例0.123456"))
      .toBe("净结余-120,000元，编号PLAN_12345，比例0.123456");
  });

  it("formats amounts before punctuation in generated explanations", () => {
    expect(formatPlanningText("收入1200000, 缺口796000. 预计30000；毫秒.123456"))
      .toBe("收入1,200,000, 缺口796,000. 预计30,000；毫秒.123456");
  });
});
