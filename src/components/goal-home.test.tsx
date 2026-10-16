import { describe, expect, it } from "vitest";
import * as serverRenderer from "react-dom/server";
import { CreatedGoalsPanel, GoalHome } from "./goal-home";

const render = serverRenderer.renderToStaticMarkup ?? serverRenderer.renderToString;

const goals = [
  { id: "goal-home", name: "三年后购房", type: "HOME_PURCHASE", targetAmountMinor: "50000000", targetDate: "2029-09-01", preparedAmountMinor: "10000000", monthlyContributionMinor: "0", priority: 1, isFlexible: true },
  { id: "goal-break", name: "半年后职业休整", type: "CAREER_BREAK", targetAmountMinor: "12000000", targetDate: "2027-03-01", preparedAmountMinor: "3000000", monthlyContributionMinor: "0", priority: 2, isFlexible: true },
];

function createdGoals(assessmentCurrent: boolean) {
  return <CreatedGoalsPanel
    goals={goals}
    planningGoalId="goal-home"
    assessmentCurrent={assessmentCurrent}
    canAssess
    onEdit={() => {}}
    onDelete={() => {}}
    onStartPlanning={() => {}}
    onStartAssessment={() => {}}
  />;
}

describe("goal home planning entry", () => {
  it("routes the selected goal toward assessment when no current assessment exists", () => {
    const html = render(createdGoals(false));
    expect(html).toContain("开始现状评估");
    expect(html).toContain("开始规划");
    expect(html).toContain("开始现状评估：三年后购房");
    expect(html).toContain("编辑目标：三年后购房");
    expect(html).toContain("删除目标：三年后购房");
  });

  it("offers to continue the selected goal after assessment is current", () => {
    const html = render(createdGoals(true));
    expect(html).toContain("继续规划");
    expect(html).toContain("继续规划：三年后购房");
  });

  it("keeps creation separate from the saved goal list", () => {
    const html = render(<GoalHome workspaceId="workspace-1" goals={goals} multiGoalConsentAt={null} onDataChange={async () => {}} />);
    expect(html).toContain("让 AI 帮助思考");
    expect(html).not.toContain("已创建目标");
  });
});
