import { describe, expect, it } from "vitest";
import { defaultLedgerHeaders, ledgerHeadersSchema } from "./ledger-headers";

describe("custom ledger headers", () => {
  it("keeps stable field keys and supplies defaults for existing workspaces", () => {
    expect(ledgerHeadersSchema.parse({})).toEqual(defaultLedgerHeaders);
    expect(ledgerHeadersSchema.parse({ assetName: " 我的账户 " })).toMatchObject({ assetName: "我的账户", assetAmount: "余额" });
  });
  it("rejects blank, oversized and unknown column definitions", () => {
    for (const value of [{ assetName: " " }, { assetName: "x".repeat(25) }, { amount: "new field" }]) {
      expect(() => ledgerHeadersSchema.parse(value)).toThrow();
    }
  });
});
