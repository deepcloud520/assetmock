import { describe, expect, it } from "vitest";
import * as serverRenderer from "react-dom/server";
import { BookkeepingView } from "./bookkeeping-view";

const render = serverRenderer.renderToStaticMarkup ?? serverRenderer.renderToString;

describe("bookkeeping view", () => {
  it("renders the entry and records workflow under the shared cashflow tabs", () => {
    const html = render(<BookkeepingView workspaceId="workspace-1" />);
    for (const label of ["快速记一笔", "收支类型", "金额", "日期", "一句话说明", "流水记录"]) {
      expect(html).toContain(label);
    }
    expect(html).toContain("本月收入");
    expect(html).toContain("本月支出");
    expect(html).toContain("本月结余");
    expect(html).not.toContain("bookkeeping-tabs");
  });
});
