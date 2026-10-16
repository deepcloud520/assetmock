import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, chinaDay, continuous, checkQuantity, checkPriceCage, fees, feeBreakdown, reserve, csvCell } from "./paper-trading";
import { parseTencent, parseSina, price } from "../server/paper-trading/market";

describe("paper trading accounting and quote contracts", () => {
  it("separates simulated commission, transfer fee and sell-only stamp duty", () => {
    expect(feeBreakdown(1_000_000n, "BUY", DEFAULT_RULES)).toEqual({ commissionMinor: 500n, transferMinor: 10n, stampMinor: 0n, totalMinor: 510n });
    expect(feeBreakdown(1_000_000n, "SELL", DEFAULT_RULES)).toEqual({ commissionMinor: 500n, transferMinor: 10n, stampMinor: 500n, totalMinor: 1010n });
    expect(feeBreakdown(0n, "SELL", DEFAULT_RULES).totalMinor).toBe(0n);
  });
  it("checks board-specific continuous-auction price cages using cent rounding", () => {
    const q = { askMinor: 129n, bidMinor: 128n, priceMinor: 129n, previousMinor: 120n };
    const input = { instrumentId: "sh600000", side: "BUY" as const, quantity: 100, limitMinor: 139n, reason: "" };
    expect(() => checkPriceCage(input, q, DEFAULT_RULES)).not.toThrow();
    expect(() => checkPriceCage({ ...input, limitMinor: 140n }, q, DEFAULT_RULES)).toThrow();
    expect(() => checkPriceCage({ ...input, instrumentId: "sh688981", limitMinor: 132n }, q, DEFAULT_RULES)).not.toThrow();
    expect(() => checkPriceCage({ ...input, instrumentId: "sh688981", limitMinor: 133n }, q, DEFAULT_RULES)).toThrow();
  });
  it("keeps decimal amounts exact, accepting only zero sub-cent precision", () => {
    expect(price("9.480")).toBe(948n); expect(price("0.01")).toBe(1n);
    expect(() => price("9.481")).toThrow(); expect(() => price("")).toThrow();
  });
  it("uses cumulative fees so the minimum commission is charged once", () => {
    const first = fees(100000n, "BUY", DEFAULT_RULES), all = fees(200000n, "BUY", DEFAULT_RULES);
    expect(first).toBe(501n); expect(all - first).toBe(1n);
    expect(reserve(1000n, 100, 100000n, first, "BUY", DEFAULT_RULES)).toBe(100001n);
    expect(fees(0n, "BUY", DEFAULT_RULES)).toBe(0n);
  });
  it("separates STAR quantity rules and odd-lot final liquidation", () => {
    const input = { instrumentId: "sh688981", side: "BUY" as const, quantity: 201, limitMinor: 100n, reason: "" };
    expect(() => checkQuantity(input, 0, DEFAULT_RULES)).not.toThrow();
    expect(() => checkQuantity({ ...input, quantity: 100 }, 0, DEFAULT_RULES)).toThrow();
    expect(() => checkQuantity({ ...input, instrumentId: "sz000001", quantity: 101 }, 0, DEFAULT_RULES)).toThrow();
    expect(() => checkQuantity({ ...input, instrumentId: "sz000001", side: "SELL", quantity: 31 }, 31, DEFAULT_RULES)).not.toThrow();
  });
  it("excludes lunch and auctions and uses Shanghai dates", () => {
    expect(continuous(new Date("2026-10-08T03:30:00Z"))).toBe(false);
    expect(continuous(new Date("2026-10-08T05:00:00Z"))).toBe(true);
    expect(continuous(new Date("2026-10-08T06:57:00Z"))).toBe(false);
    expect(chinaDay(new Date("2026-10-07T16:01:00Z"))).toBe("2026-10-08");
  });
  it("parses quote time and share units without renewal on repeated payloads", () => {
    const s = Array(50).fill("0"); Object.assign(s, { 1: "浦发银行", 2: "600000", 3: "9.48", 4: "9.18", 9: "9.47", 10: "12", 19: "9.48", 20: "17", 30: "20261008100000", 47: "10.10", 48: "8.26" });
    const body = `v_sh600000="${s.join("~")}";`;
    const q = parseTencent(body, new Date("2026-10-08T02:00:01Z"))[0];
    expect(q.bidQuantity).toBe(1200); expect(q.askQuantity).toBe(1700);
    expect(q.sourceAt.toISOString()).toBe("2026-10-08T02:00:00.000Z");
    expect(q.id).toBe(parseTencent(body, new Date("2026-10-08T02:00:09Z"))[0].id);
  });
  it("does not multiply Sina quantities by Tencent's lot unit", () => {
    const s = Array(33).fill("0"); Object.assign(s, { 0: "浦发银行", 2: "9.18", 3: "9.48", 10: "1200", 11: "9.47", 20: "1700", 21: "9.48", 30: "2026-10-08", 31: "10:00:00" });
    expect(parseSina(`var hq_str_sh600000="${s.join(",")}";`)[0].askQuantity).toBe(1700);
  });
  it("quotes CSV cells and prevents formula execution", () => { expect(csvCell('=SUM(1,2)')).toBe('"\'=SUM(1,2)"'); expect(csvCell('a"b')).toBe('"a""b"'); });
});
