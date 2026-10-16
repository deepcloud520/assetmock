import { z } from "zod";
import { structuredResponse } from "./agent-runtime";

export const ASSET_CLASSIFIER_VERSION = "asset-classifier-v0";

const assetTypes = ["CASH", "BANK_DEPOSIT", "MONEY_MARKET", "BOND", "BOND_FUND", "EQUITY", "EQUITY_FUND", "REAL_ESTATE", "INSURANCE_CASH_VALUE", "PENSION", "ALTERNATIVE", "OTHER"] as const;
const liquidityLevels = ["T0", "D7", "D30", "Y1", "GT_Y1", "ILLIQUID"] as const;

const classificationSchema = z.object({
  items: z.array(z.object({
    index: z.number().int().nonnegative(),
    type: z.enum(assetTypes),
    liquidityLevel: z.enum(liquidityLevels),
    riskLevel: z.number().int().min(1).max(5),
    isInvestable: z.boolean(),
  }).strict()).max(100),
}).strict();

const outputJsonSchema = {
  type: "object", additionalProperties: false, required: ["items"],
  properties: {
    items: {
      type: "array", maxItems: 100,
      items: {
        type: "object", additionalProperties: false,
        required: ["index", "type", "liquidityLevel", "riskLevel", "isInvestable"],
        properties: {
          index: { type: "integer", minimum: 0 },
          type: { type: "string", enum: assetTypes },
          liquidityLevel: { type: "string", enum: liquidityLevels },
          riskLevel: { type: "integer", minimum: 1, maximum: 5 },
          isInvestable: { type: "boolean" },
        },
      },
    },
  },
};

const instructions = `你是AI资产管家的资产名称识别器。只依据用户给出的资产名称，为每项资产填写系统内部属性。
类型只能使用：CASH现金、BANK_DEPOSIT银行存款、MONEY_MARKET货币基金、BOND债券、BOND_FUND债券基金、EQUITY股票、EQUITY_FUND权益基金、REAL_ESTATE房产、INSURANCE_CASH_VALUE保险现金价值、PENSION养老金、ALTERNATIVE另类资产、OTHER其他。
流动性只能使用：T0随时可用、D7七日内、D30三十日内、Y1一年内、GT_Y1一年以上、ILLIQUID难以变现。
风险等级为1至5。不能从名称可靠判断时使用OTHER、D30、2、false。必须逐项返回原index，不得创造资产。`;

export type AssetClassification = {
  type: typeof assetTypes[number];
  liquidityLevel: typeof liquidityLevels[number];
  riskLevel: number;
  isInvestable: boolean;
  classificationSource: "AI_INFERRED" | "RULE_FALLBACK";
  classificationVersion: string;
};

export async function classifyAssetNames(names: string[]): Promise<AssetClassification[]> {
  if (!names.length) return [];
  try {
    const raw = await structuredResponse<unknown>(instructions, { assets: names.map((name, index) => ({ index, name })) }, "asset_classification", outputJsonSchema);
    const parsed = classificationSchema.parse(raw);
    const byIndex = new Map(parsed.items.map((item) => [item.index, item]));
    if (byIndex.size !== names.length || names.some((_, index) => !byIndex.has(index))) throw new Error("INCOMPLETE_ASSET_CLASSIFICATION");
    return names.map((_, index) => {
      const { type, liquidityLevel, riskLevel, isInvestable } = byIndex.get(index)!;
      return { type, liquidityLevel, riskLevel, isInvestable, classificationSource: "AI_INFERRED", classificationVersion: ASSET_CLASSIFIER_VERSION };
    });
  } catch {
    return names.map((name) => ({ ...fallbackClassification(name), classificationSource: "RULE_FALLBACK", classificationVersion: ASSET_CLASSIFIER_VERSION }));
  }
}

function fallbackClassification(nameValue: string): Omit<AssetClassification, "classificationSource" | "classificationVersion"> {
  const name = nameValue.toLowerCase();
  if (/微信|支付宝|余额宝|钱包|现金|活期/.test(name)) return { type: "CASH", liquidityLevel: "T0", riskLevel: 1, isInvestable: true };
  if (/定期|存款|银行/.test(name)) return { type: "BANK_DEPOSIT", liquidityLevel: "Y1", riskLevel: 1, isInvestable: true };
  if (/货币基金/.test(name)) return { type: "MONEY_MARKET", liquidityLevel: "D7", riskLevel: 1, isInvestable: true };
  if (/债券基金|债基/.test(name)) return { type: "BOND_FUND", liquidityLevel: "D7", riskLevel: 2, isInvestable: true };
  if (/债券|国债/.test(name)) return { type: "BOND", liquidityLevel: "D30", riskLevel: 2, isInvestable: true };
  if (/股票|证券/.test(name)) return { type: "EQUITY", liquidityLevel: "D7", riskLevel: 4, isInvestable: true };
  if (/基金|指数|etf/.test(name)) return { type: "EQUITY_FUND", liquidityLevel: "D7", riskLevel: 3, isInvestable: true };
  if (/房|车位|商铺|不动产/.test(name)) return { type: "REAL_ESTATE", liquidityLevel: "ILLIQUID", riskLevel: 2, isInvestable: false };
  if (/保险|保单/.test(name)) return { type: "INSURANCE_CASH_VALUE", liquidityLevel: "Y1", riskLevel: 1, isInvestable: false };
  if (/养老金|年金/.test(name)) return { type: "PENSION", liquidityLevel: "GT_Y1", riskLevel: 2, isInvestable: false };
  if (/黄金|贵金属|收藏|数字货币|加密/.test(name)) return { type: "ALTERNATIVE", liquidityLevel: "GT_Y1", riskLevel: 5, isInvestable: true };
  return { type: "OTHER", liquidityLevel: "D30", riskLevel: 2, isInvestable: false };
}
