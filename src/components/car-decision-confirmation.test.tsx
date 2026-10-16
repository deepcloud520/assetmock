import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AdoptionDialog } from "./car-planning-view";
import { carFactsSchema, calculateCarScenario } from "@/domain/car-planning";
it("shows concrete tradeoffs without requiring a reason or hidden profile consent", () => {
  const facts = carFactsSchema.parse({ targetMonth: "2027-04", budgetMinor: "10000000", reserveFloorMinor: "3000000", cuts: [{ id: "c", name: "外卖", amountMinor: "10000", impact: "每周少点一次", accepted: true }] });
  const scenario = calculateCarScenario(facts, { asOfMonth: "2026-10", portfolioRevision: 1, transactionRevision: 0, sources: [], protectedSources: [], monthlyDebtMinor: "0", otherGoalMonthlyMinor: "0", otherGoalReserveMinor: "0", missing: [] }, "ON_TIME", "CASH", 10000000n, "2027-04");
  const html = renderToStaticMarkup(<AdoptionDialog facts={facts} scenario={scenario} evaluation={null} busy={false} onClose={() => {}} onConfirm={() => {}} />);
  expect(html).toContain("每周少点一次"); expect(html).toContain("应急储备底线"); expect(html).toContain("不自动修改长期画像");
  expect(html).not.toContain("textarea"); expect(html).not.toContain("选择理由");
});
