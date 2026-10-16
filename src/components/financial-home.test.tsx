import type { ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FinancialHome } from "./financial-home";

type HomeProps = ComponentProps<typeof FinancialHome>;
const base: HomeProps = {
  workspaceId: "layout-test", revision: 0, saving: false,
  profile: {
    age: null, familyStatus: "SINGLE", riskLevel: "BALANCED", baseCurrency: "CNY",
    stableMonthlyIncomeMinor: "0", otherMonthlyIncomeMinor: "0",
    rentExpenseMinor: "0", transportExpenseMinor: "0", essentialExpenseMinor: "0",
  },
  assets: [], liabilities: [], goals: [], multiGoalConsentAt: null,
  assessment: null, assessmentStale: false, assessmentLoading: false,
  assessmentFocusRequest: 0, assessmentCurrent: false, planningGoal: null,
  onOpenGoalManager: () => {}, onAssess: async () => {}, onViewReport: () => {},
  onStartPlanning: () => {}, onEdit: () => {}, onDelete: () => {},
  onSave: async () => {}, onSaveProfile: async () => true, onDataChange: async () => {},
};

describe("wealth overview layout", () => {
  it("merges cashflow into the summary and keeps goal chat available with no goals", () => {
    const html = renderToStaticMarkup(<FinancialHome {...base} />);
    const summaryStart = html.indexOf('class="home-summary-column"');
    const cashflow = html.indexOf('class="home-cashflow"');
    const goals = html.indexOf('class="home-created-goals"');
    const ledger = html.indexOf('class="financial-ledger"');
    expect(summaryStart).toBeLessThan(cashflow);
    expect(cashflow).toBeLessThan(goals);
    expect(goals).toBeLessThan(ledger);
    expect(html).toContain("你的目标会显示在这里");
    expect(html).toContain('class="goal-manager-link"');
    expect(html).toContain("与目标管家聊聊");
    expect(html).not.toContain("与目标管家讨论目标和进度");
    expect(html).not.toContain("NaN");
    expect(html).not.toContain("Infinity");
  });

  it.each([1, 8])("preserves all %i goals and their editing/planning controls", (count) => {
    const goals = Array.from({ length: count }, (_, index) => ({
      id: `goal-${index}`, name: `目标${index + 1}`, type: "OTHER",
      targetAmountMinor: "100000000", preparedAmountMinor: "2000000",
      targetDate: "2029-01-01", monthlyContributionMinor: "0", priority: index + 1, isFlexible: true,
    }));
    const html = renderToStaticMarkup(<FinancialHome {...base} goals={goals} />);
    expect(html.match(/class="goal-list-item /g)).toHaveLength(count);
    expect(html).not.toContain("你的目标会显示在这里");
    for (const goal of goals) {
      expect(html).toContain(`编辑目标：${goal.name}`);
      expect(html).toContain(`删除目标：${goal.name}`);
      expect(html).toContain(`开始规划：${goal.name}`);
    }
  });

  it("preserves large amounts and includes repayments when showing a monthly shortfall", () => {
    const assets: HomeProps["assets"] = [{
      id: "asset-1", name: "大额资产", type: "CASH", currentValueMinor: "123456789012",
      currency: "CNY", liquidityLevel: "HIGH", riskLevel: 1,
      isInvestable: true, isAdjustable: true, goalId: null,
    }];
    const liabilities: HomeProps["liabilities"] = [{
      id: "debt-1", name: "贷款", type: "LOAN", outstandingBalanceMinor: "2100000",
      isInstallment: true, monthlyPaymentMinor: "200000", remainingMonths: 12,
      totalRepaymentMinor: null, principalMinor: null, interestMinor: null, repaymentMethod: null,
    }];
    const html = renderToStaticMarkup(<FinancialHome {...base} assets={assets} liabilities={liabilities}
      profile={{ ...base.profile, stableMonthlyIncomeMinor: "1000000", essentialExpenseMinor: "1500000" }} />);
    expect(html).toContain("¥1,234,567,890");
    expect(html).toContain("¥17,000");
    expect(html).toContain("每月缺口");
    expect(html).toContain("¥7,000");
    expect(html).toContain('aria-label="大额资产金额"');
    expect(html).toContain('aria-label="批量录入资产"');
    expect(html).toContain('aria-label="批量录入负债"');
    expect(html.match(/class="record-scroll-track"/g)).toHaveLength(2);
  });
});
