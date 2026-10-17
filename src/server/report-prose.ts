export const REPORT_PROSE_INSTRUCTIONS = `【面向用户的文字约束】
所有摘要、积极因素、风险证据与解释、四账户评价、建议和待补充信息均使用自然中文。
USER_CONFIRMED、CALCULATED、AI_INFERRED 仅用于内部判断，禁止出现在报告文字中；需要说明来源时使用“您提供的信息”“根据底账计算”“初步判断”。推断仍须明确为推断。
输入金额单位为人民币分，报告文字必须除以100换算为元或万元，禁止展示原始金额加“分”或“万分”。例如输入月结余2000000分，应写“月结余20,000元”或“月结余2万元”。评分仍可使用“分”。
JSON 的枚举值、ID及结构化 amount 字段保持原格式；amount 仍引用输入中的分值，不换算。`;

const internalFields = new Set(["id", "risk_id", "related_goal_ids", "status", "severity", "category", "priority", "amount", "currency", "field", "account", "account_impacts", "data_completeness", "confidence"]);

export function reportProseIssues(value: unknown, path = "report"): string[] {
  if (typeof value === "string") {
    const issues: string[] = [];
    if (/\b(?:USER_CONFIRMED|CALCULATED|AI_INFERRED)\b/.test(value)) issues.push(`${path}：包含内部来源标签`);
    // Small numeric scores are valid; money contexts distinguish them from fen.
    const fenAmounts = [...value.matchAll(/([\d,]+(?:\.\d+)?)(万)?\s*分(?!钟|期|析|配|之)/g)];
    if (fenAmounts.some((match) => {
      const prefix = value.slice(0, match.index);
      if (/(?:评分|得分|健康度|账户分数)[^，。；]{0,8}$/.test(prefix)) return false;
      return match[2] || Number(match[1].replaceAll(",", "")) > 100
        || /(?:金额|收入|支出|盈余|结余|资产|负债|本金|利息|预算|资金|还款)[^，。；]{0,12}$/.test(prefix);
    })) {
      issues.push(`${path}：金额仍以分展示，请换算为元`);
    }
    return issues;
  }
  if (Array.isArray(value)) return value.flatMap((item, index) => reportProseIssues(item, `${path}[${index}]`));
  if (value && typeof value === "object") return Object.entries(value)
    .filter(([key]) => !internalFields.has(key))
    .flatMap(([key, item]) => reportProseIssues(item, `${path}.${key}`));
  return [];
}

export async function generateReportWithProseCheck<T>(
  instructions: string,
  input: Record<string, unknown>,
  generate: (instructions: string, input: Record<string, unknown>) => Promise<T>,
): Promise<T> {
  const reportInstructions = `${instructions}\n\n${REPORT_PROSE_INSTRUCTIONS}`;
  const output = await generate(reportInstructions, input);
  const issues = reportProseIssues(output);
  if (!issues.length) return output;
  const corrected = await generate(`${reportInstructions}\n修正上一份输出中列出的文字问题，保持事实、比例、评分、ID和结构化金额不变，返回完整且符合原Schema的JSON。`, {
    ...input,
    previous_output: output,
    correction_feedback: issues,
  });
  if (reportProseIssues(corrected).length) throw new Error("INVALID_REPORT_PROSE");
  return corrected;
}
