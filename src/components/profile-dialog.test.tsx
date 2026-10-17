import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProfileDialog, type Profile } from "./profile-dialog";

const profile: Profile = {
  age: 32,
  familyStatus: "SINGLE",
  riskLevel: "BALANCED",
  baseCurrency: "CNY",
  stableMonthlyIncomeMinor: "1000000",
  otherMonthlyIncomeMinor: "500000",
  rentExpenseMinor: "300000",
  transportExpenseMinor: "100000",
  essentialExpenseMinor: "200000",
};

describe("profile dialog", () => {
  it("combines the existing profile fields with the current monthly cashflow and read-only debt payment", () => {
    const html = renderToStaticMarkup(<ProfileDialog
      profile={profile}
      monthlyIncome={1500000n}
      monthlyOutflow={800000n}
      monthlyRepayment={200000n}
      saving={false}
      onClose={() => {}}
      onSave={async () => true}
    />);

    expect(html).toContain('role="dialog"');
    expect(html).toContain("个人画像与每月收支");
    expect(html).toContain("月收入");
    expect(html).toContain("月支出与还款");
    expect(html).toContain("每月可结余");
    expect(html).toContain("15,000");
    expect(html).toContain("8,000");
    expect(html).toContain("7,000");
    expect(html).toContain("2,000");
    expect(html).toContain('name="age"');
    expect(html).toContain('name="familyStatus"');
    expect(html).toContain('name="riskLevel"');
    expect(html).toContain('name="stableMonthlyIncome"');
    expect(html).toContain('name="essentialExpense"');
    expect(html).toContain("每月还款来自负债记录");
  });
});
