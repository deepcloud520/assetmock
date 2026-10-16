import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DiagnosisView, type DiagnosisResult } from "./agent-views";
import { ActionsView, type ExecutionResults } from "./execution-views";

describe("diagnosis and execution presentation", () => {
  it("shows readable Chinese labels and keeps detailed risk evidence collapsible", () => {
    const result: DiagnosisResult = {
      id: "diagnosis", sourceRevision: 1, isStale: false, mode: "OPENAI", model: "test", createdAt: "2026-09-27T00:00:00.000Z",
      healthScore: 62, summary: "需要关注流动性", dimensions: [],
      overallAssessment: { status: "ATTENTION", summary: "需要关注流动性", positive_foundations: [] },
      findings: [{ id: "risk", priority: 1, severity: "HIGH", category: "FINANCIAL_SAFETY", title: "应急资金不足", conclusion: "现金缓冲偏少", evidence: ["现金不足三个月支出"], reason: "现金少", impact: "可能影响目标", direction: "核对现金储备" }],
    };
    const html = renderToStaticMarkup(<DiagnosisView result={result} onGoToAssessment={() => {}} />);
    expect(html).toContain("text-[18px]");
    expect(html).toContain("需要关注");
    expect(html).toContain("高优先级");
    expect(html).toContain("财务安全");
    expect(html).toContain("<details");
    expect(html).not.toContain("FINANCIAL_SAFETY");
  });

  it("shows a short title and keeps the original title in collapsed details", () => {
    const action: NonNullable<ExecutionResults["actions"]>["items"][number] = {
      id: "action", sourceRevision: 1, isStale: false, isOverdue: false, kind: "DIAGNOSIS",
      title: "核对未来十二个月必须偿还的债务", reason: "先确认偿债压力", amountMinor: null, priority: 1,
      dueDate: null, status: "ACCEPTED", diagnosisId: "diagnosis", details: { steps: ["整理还款记录"], prerequisites: [], completionCriteria: "记录完整", verificationRequired: "更新底账" },
      productConditions: null, feedback: [],
    };
    const html = renderToStaticMarkup(<ActionsView result={{ generationTaskId: "task", sourceRevision: 1, isStale: false, items: [action] }} loading={false} onStatus={async () => true} />);
    expect(html).toContain("核对未来十二个月…");
    expect(html).toContain("查看详情");
    expect(html).toContain(action.title);
    expect(html).toContain("整理还款记录");
  });
});
