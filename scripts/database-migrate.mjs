import runtime from "./lib/cli.mjs";
import { mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync, chmodSync } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
// Stop the local preview before running this command. No AI or network calls occur here.
runtime.loadEnvironment();
process.env.DATABASE_URL ||= "file:./financial-associates.db";
const url = process.env.DATABASE_URL;
if (!url.startsWith("file:")) throw new Error("This migration runner only supports the local SQLite demo.");
const localFile = url.slice(5).split("?")[0]; const file = path.isAbsolute(localFile) ? localFile : path.resolve("prisma", localFile);
const dir = process.env.DATABASE_BACKUP_DIR ?? path.resolve(".local-data/backups"); mkdirSync(dir, { recursive: true, mode: 0o700 });
const python = (code, ...args) => runtime.runPythonSync(code, args);
const preflightCode = `import sqlite3,json,sys,hashlib,pathlib
c=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True)
assert c.execute('pragma integrity_check').fetchone()[0]=='ok','integrity failed'
assert not c.execute('pragma foreign_key_check').fetchall(),'foreign reference failed'
tables={x[0] for x in c.execute("select name from sqlite_master where type='table'")}
assert not c.execute('select id from Goal where priority<1 or priority>5').fetchall(),'invalid priority; repair before migration'
rows={t:c.execute('select * from "'+t+'" order by id').fetchall() for t in ['Asset','Liability','Transaction','CarFundingReservation','CarPlanVersion'] if t in tables}
rows['Goal']=c.execute('select id,workspaceId,targetAmountMinor,preparedAmountMinor,monthlyContributionMinor,priority from Goal order by id').fetchall()
paper={t:c.execute('select * from "'+t+'" order by id').fetchall() for t in ['PaperOrder','PaperFill','PaperPosition','PaperPositionLot','PaperCashEntry'] if t in tables}
if 'PaperAccount' in tables: paper['PaperAccount']=c.execute('select id,workspaceId,status,initialMinor,cashMinor,frozenMinor,realizedMinor,feesMinor,version,ruleId,health,createdAt,archivedAt from PaperAccount order by id').fetchall()
print(json.dumps({'coreHash':hashlib.sha256(json.dumps(rows,sort_keys=True).encode()).hexdigest(),'paperHash':hashlib.sha256(json.dumps(paper,sort_keys=True).encode()).hexdigest(),'counts':{t:len(r) for t,r in rows.items()},'schemaVersion':c.execute('select migration_name from _prisma_migrations where finished_at is not null order by migration_name desc limit 1').fetchone()[0]}))`;
const before = JSON.parse(python(preflightCode, file));
const id = randomUUID(); const target = path.join(dir, `${id}.sqlite`);
python("import sqlite3,sys,pathlib\ns=sqlite3.connect(pathlib.Path(sys.argv[1]).resolve().as_uri()+'?mode=ro',uri=True);d=sqlite3.connect(sys.argv[2]);s.backup(d);d.close();s.close()", file, target); chmodSync(target, 0o600);
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
writeFileSync(path.join(dir, `${id}.json`), JSON.stringify({ id, kind: "MIGRATION", createdAt: new Date().toISOString(), date, hash: createHash("sha256").update(readFileSync(target)).digest("hex"), schemaVersion: before.schemaVersion }), { mode: 0o600 });
runtime.runCli("prisma", ["migrate", "deploy"], { stdio: "inherit", env: process.env });
const after = JSON.parse(python(preflightCode, file));
if (after.coreHash !== before.coreHash) throw new Error("Migration changed financial records. Preserve the migration backup and stop.");
if (after.paperHash !== before.paperHash) throw new Error("Migration changed simulated ledger facts. Preserve the backup and stop.");
runtime.runCli("vitest", ["run", "scripts/complete-business-migration.test.ts"], { stdio: "inherit", env: { ...process.env, RUN_UNIFIED_MIGRATION: "1" } });
const retained = readdirSync(dir).filter((n) => /^[a-f0-9-]{36}\.json$/.test(n)).map((n) => JSON.parse(readFileSync(path.join(dir, n), "utf8"))).filter((b) => b.kind === "MIGRATION").sort((a,b) => b.createdAt.localeCompare(a.createdAt));
for (const old of retained.slice(3)) for (const ext of ["json", "sqlite"]) unlinkSync(path.join(dir, `${old.id}.${ext}`));
mkdirSync(".local-data", { recursive: true, mode: 0o700 }); writeFileSync(".local-data/schema-migration-report.json", JSON.stringify({ completedAt: new Date().toISOString(), before, after, migrationBackupId: id, financialFactsUnchanged: true, simulatedLedgerUnchanged: true }, null, 2), { mode: 0o600 });
console.log("Migration and financial consistency checks completed. Reports are in .local-data.");
