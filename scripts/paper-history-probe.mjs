import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";

// Read-only, bounded validation: two public history requests per symbol, no ledger writes.
const symbols = ["sh600000", "sz000001", "sz300750", "sz300059", "sh688981", "sh688111"];
const day = process.argv[2];
if (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? "")) throw new Error("Usage: node scripts/paper-history-probe.mjs YYYY-MM-DD (Asia/Shanghai)");
const output = join(".local-data", "market-probes", `history-${day}`);
await mkdir(output, { recursive: true });
const results = [];
for (const symbol of symbols) {
  for (const provider of ["SINA_MINUTE", "TENCENT_DAY"]) {
    const url = provider === "SINA_MINUTE" ? `https://quotes.sina.cn/cn/api/jsonp_v2.php/=/CN_MarketDataService.getKLineData?symbol=${symbol}&scale=1&ma=no&datalen=1970` : `https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param=${symbol},day,,,60,`;
    const started = Date.now();
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Referer: "https://finance.sina.com.cn/" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const raw = await response.text(), rawFile = `${symbol}-${provider}.txt`;
      await writeFile(join(output, rawFile), raw);
      const parsed = provider === "SINA_MINUTE" ? JSON.parse(raw.slice(raw.indexOf("=(") + 2, raw.lastIndexOf(");"))) : JSON.parse(raw);
      const rows = provider === "SINA_MINUTE" ? parsed : parsed?.data?.[symbol]?.day;
      if (!Array.isArray(rows)) throw new Error("No unadjusted history rows returned");
      const getDay = r => provider === "SINA_MINUTE" ? r.day?.slice(0, 10) : r[0];
      const finished = rows.filter(r => getDay(r) < day);
      const counts = {}; for (const row of finished) { const d = getDay(row); counts[d] = (counts[d] ?? 0) + 1; }
      const dates = Object.keys(counts).sort();
      const completeDays = provider === "SINA_MINUTE" ? dates.filter(d => counts[d] === 240) : dates;
      const record = { symbol, provider, url, fetchedAt: new Date().toISOString(), elapsedMs: Date.now() - started,
        rawFile, sha256: createHash("sha256").update(raw).digest("hex"), rows: rows.length, finishedRows: finished.length, dates, completeDays: completeDays.length,
        rowsByDay: counts, has20FinishedDays: completeDays.length >= 20, fieldExample: finished.at(-1) ?? null,
        volumeUnitVerified: false, dataUseChecked: false, corporateActionCoverageVerified: false };
      results.push(record);
    } catch (error) { results.push({ symbol, provider, url, elapsedMs: Date.now() - started, error: error.message }); }
  }
}
const minutePassed = results.filter(r => r.provider === "SINA_MINUTE" && r.has20FinishedDays).length === symbols.length;
const report = { checkedDay: day, checkedAt: new Date().toISOString(), requestedSymbols: symbols, results,
  preferredResolution: minutePassed ? "MINUTE_PENDING_REVIEW" : "DAY_PENDING_REVIEW",
  fallbackReason: minutePassed ? "" : "免费分钟接口未证明六只证券连续20个完整交易日覆盖，按已确认口径降为日线；原始结果保留供核对。",
  readyToImport: false,
  remaining: ["成交量单位与价格精度核对", "历史交易日历与证券状态", "公司行为覆盖", "数据使用条件核对"] };
await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ output, preferredResolution: report.preferredResolution, minuteCompleteDays: results.filter(r => r.provider === "SINA_MINUTE").map(r => ({ symbol: r.symbol, days: r.completeDays ?? 0, error: r.error ?? null })), dailyAvailable: results.filter(r => r.provider === "TENCENT_DAY").map(r => ({ symbol: r.symbol, rows: r.finishedRows ?? 0, error: r.error ?? null })), readyToImport: false }, null, 2));
