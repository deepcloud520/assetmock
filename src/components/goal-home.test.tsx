import { describe, expect, it } from "vitest";
import * as serverRenderer from "react-dom/server";
import { CreatedGoalsPanel, GoalHome } from "./goal-home";

const render = serverRenderer.renderToStaticMarkup ?? serverRenderer.renderToString;

const goals = [
  { id: "goal-home", name: "三年后购房", type: "HOME_PURCHASE", targetAmountMinor: "50000000", targetDate: "2029-09-01", preparedAmountMinor: "10000000", monthlyContributionMinor: "0", priority: 1, isFlexible: true },
  { id: "goal-break", name: "半年后职业休整", type: "CAREER_BREAK", targetAmountMinor: "12000000", targetDate: "2027-03-01", preparedAmountMinor: "3000000", monthlyContributionMinor: "0", priority: 2, isFlexible: true },
];

function createdGoals() {
  return <CreatedGoalsPanel
    goals={goals}
    planningGoalId="goal-home"
    onEdit={() => {}}
    onDelete={() => {}}
  />;
}

describe("goal home planning entry", () => {
  it("shows saved goals and progress without planning actions", () => {
    const html = render(createdGoals());
    expect(html).not.toContain("开始现状评估");
    expect(html).not.toContain("开始规划");
    expect(html).not.toContain("继续规划");
    for (const goal of goals) {
      expect(html).toContain(goal.name);
      expect(html).toContain(`编辑目标：${goal.name}`);
      expect(html).toContain(`删除目标：${goal.name}`);
      expect(html).toContain(`${goal.name}准备进度`);
    }
    expect(html).toContain("20%");
    expect(html).toContain("25%");
  });

  it("keeps creation separate from the saved goal list", () => {
    const html = render(<GoalHome workspaceId="workspace-1" goals={goals} multiGoalConsentAt={null} onDataChange={async () => {}} />);
    expect(html).toContain("让 AI 帮助思考");
    expect(html).not.toContain("已创建目标");
  });
});
