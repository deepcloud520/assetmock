import { describe, expect, it } from "vitest";
import { buildAgentRequest, runDiagnosisNarrative, runFuturePlanningReport, runtimeDateTime, structuredResponse } from "./agent-runtime";
import { afterEach, vi } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("buildAgentRequest", () => {
  const schema = { type: "object" };

  it("uses the Responses API for the default OpenAI base URL", () => {
    const request = buildAgentRequest(undefined, "gpt-5", "instructions", { value: 1 }, "result", schema);

    expect(request.url).toBe("https://api.openai.com/v1/responses");
    expect(request.body).toMatchObject({
      model: "gpt-5",
      text: { format: { type: "json_schema", name: "result", strict: true, schema } },
    });
    expect(request.body.instructions).toContain("时区：Asia/Shanghai");
  });

  it("uses Chat Completions JSON mode for an OpenAI-compatible provider", () => {
    const request = buildAgentRequest(
      "https://aiping.cn/api/v1/",
      "DeepSeek-V3.2",
      "instructions",
      { value: 1 },
      "result",
      schema,
    );

    expect(request.url).toBe("https://aiping.cn/api/v1/chat/completions");
    expect(request.body).toMatchObject({
      model: "DeepSeek-V3.2",
      stream: false,
      response_format: { type: "json_object" },
      messages: [
        { role: "system" },
        { role: "user", content: JSON.stringify({ value: 1 }) },
      ],
    });
    const systemMessage = (request.body.messages as Array<{ content: string }>)[0].content;
    expect(systemMessage).toContain("Schema 名称：result");
    expect(systemMessage).toContain(JSON.stringify(schema));
  });

  it("formats the current date and time in the configured timezone", () => {
    expect(runtimeDateTime(new Date("2026-09-18T09:04:05Z"), "Asia/Shanghai")).toEqual({
      currentDate: "2026-09-18",
      currentTime: "17:04:05",
      timeZone: "Asia/Shanghai",
    });
  });
});

describe("structuredResponse provider errors", () => {
  it("keeps provider diagnostics while redacting the configured API key", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("OPENAI_BASE_URL", "https://aiping.cn/api/v1");
    vi.stubEnv("OPENAI_API_KEY", "secret-test-key");
    vi.stubEnv("OPENAI_MODEL", "test-model");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 401, msg: "invalid secret-test-key" }), { status: 401 })));

    const error = await structuredResponse("instructions", {}, "result", { type: "object" }).catch((value: unknown) => value);
    expect(error).toBeInstanceOf(Error);
    if (!(error instanceof Error)) throw error;
    expect(error.message).toBe("OPENAI_401 invalid [redacted]");
    expect(error.message).not.toContain("secret-test-key");
  });
});

describe("future planning output contract", () => {
  it("sends the assumption limit and ID format to the model", async () => {
    vi.stubEnv("ALLOW_AI_IN_TEST", "true");
    vi.stubEnv("OPENAI_BASE_URL", "https://aiping.cn/api/v1");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "test-model");
    const output = {
      information_completeness: "INSUFFICIENT", summary: "需要补充信息。", assumptions: [], risks: [], actions: [],
      missing_information: [{ field: "goal.budget", why_needed: "影响目标测算。", question: "目标预算是多少？" }],
      disclaimer: "本规划用于资产整理与目标规划参考，不构成投资建议。",
    };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(output) } }] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout");

    await runFuturePlanningReport({});

    expect(timeoutSpy).toHaveBeenCalledWith(120_000);
    const request = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    const system = request.messages[0].content as string;
    const input = JSON.parse(request.messages[1].content as string);
    expect(system).toContain("assumptions 最多5条");
    expect(system).toContain("risk_1、risk_2、risk_3");
    expect(system).toContain("allowed_action_amounts_minor");
    expect(input.allowed_action_amounts_minor).toEqual([]);
    expect(system).toContain('"pattern":"^[a-z][a-z0-9_]{0,63}$"');
  });
});

describe("diagnosis prose correction", () => {
  it("corrects user prose while keeping structured amounts in fen", async () => {
    vi.stubEnv("ALLOW_AI_IN_TEST", "true");
    vi.stubEnv("OPENAI_BASE_URL", "https://aiping.cn/api/v1");
    vi.stubEnv("OPENAI_API_KEY", "test-key");
    vi.stubEnv("OPENAI_MODEL", "test-model");
    const output = {
      overall_assessment: { status: "ATTENTION", summary: "每月盈余2000000分", positive_foundations: ["收入稳定（CALCULATED）"] },
      risks: [{ id: "reserve", priority: 1, severity: "MEDIUM", category: "LIQUIDITY", title: "核对储备", conclusion: "需要核对储备。", evidence: ["月结余2000000分"], reason: "储备信息不足。", impact: "影响应急判断。", related_goal_ids: [], direction: "核对现金。" }],
      three_month_actions: [{ id: "action_1", risk_id: "reserve", priority: "P1", title: "核对储备", reason: "确认储备。", steps: ["核对余额"], amount: "2000000", currency: "CNY", due_in_days: 7, prerequisites: [], completion_criteria: "核对完成。", verification_required: "更新底账。" }],
      missing_information: [], disclaimer: "本诊断用于资产整理与规划参考，不构成投资建议。",
    };
    const corrected = {
      ...output,
      overall_assessment: { ...output.overall_assessment, summary: "月结余2万元，需要核对储备。", positive_foundations: ["已有稳定收入。"] },
      risks: [{ ...output.risks[0], evidence: ["月结余20,000元"] }],
    };
    const fetchMock = vi.fn().mockImplementation(async (_url, init: RequestInit) => {
      const input = JSON.parse(JSON.parse(init.body as string).messages[1].content);
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(input.correction_feedback ? corrected : output) } }] }));
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await runDiagnosisNarrative({ adjustable_amounts: [{ amount_minor: "2000000" }] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.output).toEqual(corrected);
    expect(result.output.three_month_actions[0].amount).toBe("2000000");
  });
});
