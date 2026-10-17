import { describe, expect, it, vi } from "vitest";
import { generateReportWithProseCheck, reportProseIssues } from "./report-prose";

describe("report prose validation", () => {
  it("checks summaries, foundations, risk evidence and four-account explanations", () => {
    const issues = reportProseIssues({
      overall_assessment: { summary: "每月结余2000000分", positive_foundations: ["收入稳定（CALCULATED）"] },
      risks: [{ evidence: ["每月盈余2,000,000分"], reason: "AI_INFERRED" }],
      accounts: [{ summary: "资金200万分", key_reasons: ["USER_CONFIRMED"], suggestions: ["核对资产2000000分"] }],
    });
    expect(issues).toHaveLength(7);
    expect(issues.some((issue) => issue.includes("positive_foundations[0]"))).toBe(true);
    expect(issues.some((issue) => issue.includes("accounts[0].suggestions[0]"))).toBe(true);
  });

  it("allows yuan, scores, time durations, structured fen and enum fields", () => {
    expect(reportProseIssues({
      summary: "月结余20,000元，资产评分64分；花3分钟核对。",
      reason: "月结余2万元，根据底账计算。", amount: "2000000", status: "HEALTHY",
      category: "FINANCIAL_SAFETY", id: "CALCULATED", related_goal_ids: ["USER_CONFIRMED"],
    })).toEqual([]);
    expect(reportProseIssues({ summary: "利息50分" })).toHaveLength(1);
  });

  it("retries once with the original input and targeted feedback", async () => {
    const first = { summary: "每月盈余2000000分（CALCULATED）", amount: "2000000" };
    const corrected = { summary: "每月盈余20,000元，根据底账计算。", amount: "2000000" };
    const generate = vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(corrected);
    const input = { cash_flow: { monthly_surplus: "2000000" } };
    await expect(generateReportWithProseCheck("custom prompt", input, generate)).resolves.toEqual(corrected);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[0][0]).toContain("禁止出现在报告文字中");
    expect(generate.mock.calls[1][1]).toMatchObject({ ...input, previous_output: first, correction_feedback: expect.arrayContaining([expect.stringContaining("金额仍以分")]) });
  });

  it("rejects a second invalid report and does not retry provider failures", async () => {
    const generate = vi.fn().mockResolvedValue({ summary: "每月盈余2000000分" });
    await expect(generateReportWithProseCheck("prompt", {}, generate)).rejects.toThrow("INVALID_REPORT_PROSE");
    expect(generate).toHaveBeenCalledTimes(2);
    const unavailable = vi.fn().mockRejectedValue(new Error("OPENAI_401"));
    await expect(generateReportWithProseCheck("prompt", {}, unavailable)).rejects.toThrow("OPENAI_401");
    expect(unavailable).toHaveBeenCalledTimes(1);
  });

  it("does not make a correction request for a valid report", async () => {
    const generate = vi.fn().mockResolvedValue({ summary: "月结余2万元。" });
    await generateReportWithProseCheck("prompt", {}, generate);
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
