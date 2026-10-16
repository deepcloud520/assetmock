import { modelConfig } from "@/lib/model-config";
import { db } from "@/lib/db";
import { ApiError } from "./portfolio";
import { buildAgentRequest, diagnosisJsonSchema, futurePlanningJsonSchema, planningJsonSchema } from "./agent-runtime";
import { DIAGNOSIS_PROMPT } from "./diagnosis-prompt";
import { FOUR_ACCOUNT_PROMPT, fourAccountJsonSchema } from "./four-account-assessment";
import { FUTURE_PLANNING_PROMPT, PLANNING_PROMPT } from "./future-planning-prompt";

export const promptKeys = ["diagnosis", "fourAccount", "planning", "actionReport"] as const;
export type PromptKey = typeof promptKeys[number];
export type PromptOverrides = Partial<Record<PromptKey, string>>;

const promptCatalog: Record<PromptKey, { label: string; group: "diagnosis" | "planning"; description: string; defaultPrompt: string; schemaName: string; schema: object }> = {
  diagnosis: { label: "财富诊断", group: "diagnosis", description: "财务状态、风险和三个月行动建议", defaultPrompt: DIAGNOSIS_PROMPT, schemaName: "wealth_diagnosis", schema: diagnosisJsonSchema },
  fourAccount: { label: "四账户配置", group: "diagnosis", description: "四账户目标比例、评分和解释", defaultPrompt: FOUR_ACCOUNT_PROMPT, schemaName: "four_account_allocation", schema: fourAccountJsonSchema },
  planning: { label: "方案说明", group: "planning", description: "Plan A / B / C 的取舍说明", defaultPrompt: PLANNING_PROMPT, schemaName: "wealth_planning", schema: planningJsonSchema },
  actionReport: { label: "行动报告", group: "planning", description: "所选方案的三个月行动清单", defaultPrompt: FUTURE_PLANNING_PROMPT, schemaName: "future_planning_action", schema: futurePlanningJsonSchema },
};

function parseOverrides(value: string): PromptOverrides {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(promptKeys.flatMap((key) => {
      const prompt = (parsed as Record<string, unknown>)[key];
      return typeof prompt === "string" && prompt.trim() ? [[key, prompt]] : [];
    })) as PromptOverrides;
  } catch {
    return {};
  }
}

export async function getPromptOverrides(workspaceId: string): Promise<PromptOverrides> {
  const workspace = await db.workspace.findUnique({ where: { id: workspaceId }, select: { promptOverridesJson: true } });
  if (!workspace) throw new ApiError("工作区不存在，请刷新页面重试", 404);
  return parseOverrides(workspace.promptOverridesJson);
}

export async function savePromptOverride(workspaceId: string, key: PromptKey, prompt: string | null) {
  if (prompt !== null && (!prompt.trim() || prompt.length > 20_000)) throw new ApiError("提示词应为 1 至 20,000 个字符", 422);
  const overrides = await getPromptOverrides(workspaceId);
  if (prompt === null || prompt === promptCatalog[key].defaultPrompt) delete overrides[key];
  else overrides[key] = prompt;
  await db.workspace.update({ where: { id: workspaceId }, data: { promptOverridesJson: JSON.stringify(overrides) } });
  return listPromptSettings(workspaceId);
}

export async function listPromptSettings(workspaceId: string) {
  const overrides = await getPromptOverrides(workspaceId);
  return promptKeys.map((key) => {
    const item = promptCatalog[key];
    const basePrompt = overrides[key] ?? item.defaultPrompt;
    const request = buildAgentRequest(modelConfig('OPENAI').BASE_URL, modelConfig('OPENAI').MODEL ?? "preview", basePrompt, {}, item.schemaName, item.schema);
    const responsesApi = request.url.endsWith("/responses");
    const finalSystemPrompt = responsesApi
      ? request.body.instructions as string
      : (request.body.messages as Array<{ role: string; content: string }>)[0].content;
    return {
      key,
      label: item.label,
      group: item.group,
      description: item.description,
      defaultPrompt: item.defaultPrompt,
      basePrompt,
      isCustomized: Boolean(overrides[key]),
      finalSystemPrompt,
      outputSchema: responsesApi ? JSON.stringify(item.schema, null, 2) : null,
      provider: responsesApi ? "OpenAI Responses" : "Chat Completions",
    };
  });
}
