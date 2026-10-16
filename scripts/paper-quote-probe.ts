import { appendFile, mkdir } from "node:fs/promises";
import { fetchQuotes } from "../src/server/paper-trading/market";
import { json } from "../src/domain/paper-trading";

// Explicit opt-in bounded probe. Does not run at application startup or enable trading.
const minutes = Number(process.argv[2] ?? "1");
if (!Number.isInteger(minutes) || minutes < 1 || minutes > 60) throw new Error("采样时长须为 1—60 分钟");
const symbols = ["sh600000", "sz000001", "sz300750", "sz300059", "sh688981", "sh688111"];
async function main() {
  await mkdir(".local-data/market-probes", { recursive: true });
  const file = `.local-data/market-probes/${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
  const end = Date.now() + minutes * 60000;
  while (Date.now() < end) {
    for (const provider of ["TENCENT", "SINA"] as const) {
      const startedAt = new Date();
      try { const quotes = await fetchQuotes(symbols, provider); await appendFile(file, json({ provider, startedAt, elapsedMs: Date.now() - startedAt.getTime(), quotes, sourceAgesMs: quotes.map(q => Date.now() - q.sourceAt.getTime()) }) + "\n"); }
      catch (e) { await appendFile(file, json({ provider, startedAt, error: e instanceof Error ? e.message : "unknown" }) + "\n"); }
    }
    await new Promise(r => setTimeout(r, 5000));
  }
  console.log(`采样记录：${file}。需区分休市与盘中样本后人工核验，脚本不会自动开放交易。`);
}
void main();
