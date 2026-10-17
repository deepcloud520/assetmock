import { z } from "zod";

const header = z.string().trim().min(1, "表头不能为空").max(24, "表头最多24字");
export const ledgerHeadersSchema = z.object({
  assetName: header.default("类目"),
  assetType: header.default("类型"),
  assetAmount: header.default("余额"),
  liabilityName: header.default("类目"),
  liabilityType: header.default("类型"),
  liabilityAmount: header.default("余额"),
  liabilityPayment: header.default("月还款"),
}).strict();

export type LedgerHeaders = z.infer<typeof ledgerHeadersSchema>;
export const defaultLedgerHeaders = ledgerHeadersSchema.parse({});
