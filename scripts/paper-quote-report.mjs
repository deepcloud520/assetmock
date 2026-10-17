import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const symbols = ["sh600000", "sz000001", "sz300750", "sz300059", "sh688981", "sh688111"];
const percentile = (values, p) => values.length ? [...values].sort((a, b) => a - b)[Math.ceil(values.length * p) - 1] : null;
function session(iso) {
  const time = new Date(Date.parse(iso) + 8 * 3600000);
  const minute = time.getUTCHours() * 60 + time.getUTCMinutes();
  if (minute >= 570 && minute < 690) return "morning";
  if (minute >= 780 && minute < 897) return "afternoon";
  return "outside";
}
function validQuote(q) {
  return symbols.includes(q.instrumentId) && Number.isFinite(Date.parse(q.sourceAt))
    && [q.priceMinor, q.previousMinor].every(v => /^\d+$/.test(String(v)) && BigInt(v) > 0n)
    && [q.bidMinor, q.askMinor].every(v => /^\d+$/.test(String(v)))
    && [q.bidQuantity, q.askQuantity].every(v => Number.isSafeInteger(v) && v >= 0);
}

export function summarizeQuotes(rows) {
  const groups = [];
  for (const provider of ["TENCENT", "SINA"]) {
    for (const window of ["morning", "afternoon"]) {
      const samples = rows.filter(r => r.provider === provider && session(r.startedAt) === window);
      const times = samples.map(r => Date.parse(r.startedAt)).sort((a, b) => a - b);
      const dates = new Set(times.map(t => new Date(t + 8 * 3600000).toISOString().slice(0, 10)));
      const successful = samples.filter(r => !r.error);
      const complete = successful.filter(r => Array.isArray(r.quotes) && r.quotes.length === symbols.length
        && new Set(r.quotes.map(q => q.instrumentId)).size === symbols.length && r.quotes.every(validQuote));
      const ages = successful.flatMap(r => (r.quotes ?? []).map(q => Date.parse(r.startedAt) + r.elapsedMs - Date.parse(q.sourceAt))).filter(Number.isFinite);
      const gaps = times.slice(1).map((t, i) => t - times[i]);
      const spanMs = times.length > 1 ? times.at(-1) - times[0] : 0;
      const successRate = samples.length ? successful.length / samples.length : 0;
      const requiredFieldsRate = successful.length ? complete.length / successful.length : 0;
      const ageP95Ms = percentile(ages, .95);
      const maxGapMs = gaps.length ? Math.max(...gaps) : null;
      const coverageComplete = dates.size === 1 && samples.length >= 300 && spanMs >= 1_770_000 && maxGapMs <= 30_000;
      const perSymbol = symbols.map(id => {
        const qs = successful.flatMap(r => r.quotes ?? []).filter(q => q.instrumentId === id);
        return { id, samples: qs.length, distinctSourceTimes: new Set(qs.map(q => q.sourceAt)).size,
          zeroBookCount: qs.filter(q => !q.bidQuantity || !q.askQuantity).length,
          nonHundredShareBooks: qs.filter(q => q.bidQuantity % 100 || q.askQuantity % 100).length };
      });
      const qualityPass = coverageComplete && successRate >= .99 && requiredFieldsRate === 1 && ageP95Ms !== null
        && ageP95Ms <= 15000 && ages.every(a => a >= -1000) && perSymbol.every(q => q.distinctSourceTimes >= 2);
      groups.push({ provider, window, dates: [...dates], requests: samples.length, successRate, requiredFieldsRate,
        spanMs, maxGapMs, ageP95Ms, ageMaxMs: ages.length ? Math.max(...ages) : null,
        requestP95Ms: percentile(successful.map(r => r.elapsedMs), .95), coverageComplete, qualityPass, perSymbol,
        errors: [...new Set(samples.filter(r => r.error).map(r => r.error))] });
    }
  }
  const candidates = ["SINA", "TENCENT"].filter(provider => groups.filter(g => g.provider === provider).every(g => g.qualityPass));
  return { generatedAt: new Date().toISOString(), inputRows: rows.length,
    excludedOutsideSession: rows.filter(r => session(r.startedAt) === "outside").length, groups,
    qualityCandidates: candidates, tradingApproved: false,
    limitations: ["质量候选不等于可交易授权；盘口单位、规则、当日证券资料及数据使用条件须独立核对。",
      "样本跨度至少 29.5 分钟、至少 300 次请求且无超过 30 秒的采样空档，才认定完成本轮 30 分钟采样覆盖。",
      "未采集的下午时段保持未完成；盘前样本和跨日期拼接不能补足时段。",
      "腾讯盘口实测存在整手精度，应作为近似数量；新浪缺少涨跌停字段，须由已核对市场资料提供。"] };
}

async function main() {
  const files = process.argv.slice(2);
  if (!files.length) throw new Error("传入上午、下午 JSONL 文件；只提供一场时不会判定整体验证通过");
  const rows = (await Promise.all(files.map(f => readFile(f, "utf8")))).flatMap(s => s.trim().split("\n").filter(Boolean).map(JSON.parse));
  const report = summarizeQuotes(rows);
  const output = resolve(".local-data/market-probes", "latest-quality-report.json");
  await writeFile(output, JSON.stringify({ ...report, files: files.map(f => resolve(f)) }, null, 2));
  console.log(output);
  console.log(JSON.stringify(report.groups.map(({ provider, window, requests, coverageComplete, qualityPass, ageP95Ms }) => ({ provider, window, requests, coverageComplete, qualityPass, ageP95Ms })), null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) await main();
