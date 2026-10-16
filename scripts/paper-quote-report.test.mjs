import { test } from "node:test";
import assert from "node:assert/strict";
import { summarizeQuotes } from "./paper-quote-report.mjs";
const ids = ["sh600000", "sz000001", "sz300750", "sz300059", "sh688981", "sh688111"];
function samples(hour, provider = "SINA") {
  return Array.from({ length: 360 }, (_, n) => {
    const startedAt = new Date(Date.UTC(2026, 9, 8, hour, 30, n * 5)).toISOString();
    return { provider, startedAt, elapsedMs: 100, quotes: ids.map(instrumentId => ({ instrumentId, sourceAt: startedAt,
      priceMinor: "1000", previousMinor: "1000", bidMinor: "999", askMinor: "1001", bidQuantity: 100, askQuantity: 123 })) };
  });
}
test("morning evidence never substitutes for afternoon", () => {
  const r = summarizeQuotes(samples(1));
  assert.equal(r.groups.find(g => g.provider === "SINA" && g.window === "morning").qualityPass, true);
  assert.deepEqual(r.qualityCandidates, []); assert.equal(r.tradingApproved, false);
});
test("counts missing instruments and stale timestamps as failures", () => {
  const rows = samples(1); rows[0].quotes.pop();
  assert.equal(summarizeQuotes(rows).groups[2].qualityPass, false);
  const stale = samples(1).map(r => ({ ...r, quotes: r.quotes.map(q => ({ ...q, sourceAt: "2026-10-07T01:30:00Z" })) }));
  assert.equal(summarizeQuotes(stale).groups[2].qualityPass, false);
});
test("requires two sessions and never authorizes trades automatically", () => {
  const r = summarizeQuotes([...samples(1), ...samples(5)]);
  assert.deepEqual(r.qualityCandidates, ["SINA"]); assert.equal(r.tradingApproved, false);
});
test("rejects collection gaps and cross-day stitched samples", () => {
  assert.equal(summarizeQuotes(samples(1).filter((_, i) => i < 100 || i > 110)).groups[2].qualityPass, false);
  const rows = samples(1); rows[359].startedAt = "2026-10-09T01:59:55Z";
  assert.equal(summarizeQuotes(rows).groups[2].qualityPass, false);
});
