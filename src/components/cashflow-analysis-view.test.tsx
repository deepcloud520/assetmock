import { describe, expect, it } from "vitest";
import * as serverRenderer from "react-dom/server";
import { CashflowAnalysisView } from "./cashflow-analysis-view";

const render = serverRenderer.renderToStaticMarkup ?? serverRenderer.renderToString;

describe("cashflow analysis view", () => {
  it("offers monthly, quarterly, and yearly user-triggered analysis", () => {
    const html = render(<CashflowAnalysisView workspaceId="workspace-1" transactionRevision={0} />);
    for (const label of ["收支管理与建议", "月度", "季度", "年度", "生成分析", "选择时间"]) expect(html).toContain(label);
  });
});
