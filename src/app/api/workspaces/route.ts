import { db } from "@/lib/db";
import { apiError } from "@/server/portfolio";

export async function POST() {
  try {
    const workspace = await db.workspace.create({
      data: {
        profile: { create: {} },
        assets: {
          create: [
            { name: "银行卡活期", type: "CASH", currentValueMinor: 0n, liquidityLevel: "T0", riskLevel: 1, isInvestable: true, isAdjustable: true },
            { name: "微信钱包", type: "CASH", currentValueMinor: 0n, liquidityLevel: "T0", riskLevel: 1, isInvestable: true, isAdjustable: true },
            { name: "支付宝余额和余额宝", type: "MONEY_MARKET", currentValueMinor: 0n, liquidityLevel: "T0", riskLevel: 1, isInvestable: true, isAdjustable: true },
            { name: "其他钱包", type: "CASH", currentValueMinor: 0n, liquidityLevel: "T0", riskLevel: 1, isInvestable: true, isAdjustable: true },
            { name: "定期存款", type: "BANK_DEPOSIT", currentValueMinor: 0n, liquidityLevel: "Y1", riskLevel: 1, isInvestable: true, isAdjustable: true },
            { name: "基金", type: "EQUITY_FUND", currentValueMinor: 0n, liquidityLevel: "D7", riskLevel: 3, isInvestable: true, isAdjustable: true },
            { name: "股票", type: "EQUITY", currentValueMinor: 0n, liquidityLevel: "D7", riskLevel: 4, isInvestable: true, isAdjustable: true },
            { name: "房车及其他固定资产", type: "REAL_ESTATE", currentValueMinor: 0n, liquidityLevel: "ILLIQUID", riskLevel: 2, isInvestable: false, isAdjustable: false },
          ],
        },
        liabilities: {
          create: [
            { name: "信用卡债务", type: "CREDIT_CARD", outstandingBalanceMinor: 0n, monthlyPaymentMinor: 0n, remainingMonths: 1 },
            { name: "花呗", type: "CONSUMER_LOAN", outstandingBalanceMinor: 0n, monthlyPaymentMinor: 0n, remainingMonths: 1 },
            { name: "美团月付", type: "CONSUMER_LOAN", outstandingBalanceMinor: 0n, monthlyPaymentMinor: 0n, remainingMonths: 1 },
            { name: "其他互联网支付", type: "OTHER", outstandingBalanceMinor: 0n, monthlyPaymentMinor: 0n, remainingMonths: 1 },
            { name: "贷款", type: "MORTGAGE", outstandingBalanceMinor: 0n, monthlyPaymentMinor: 0n, remainingMonths: 240 },
            { name: "分期付款1", type: "CONSUMER_LOAN", outstandingBalanceMinor: 0n, monthlyPaymentMinor: 0n, remainingMonths: 12 },
          ],
        },
      },
      select: { id: true, portfolioRevision: true },
    });
    return Response.json(workspace, { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
