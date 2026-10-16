import { it, expect } from "vitest";
import { db } from "../src/lib/db";
import { initializeData } from "../src/server/data-management";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const encode = (v: unknown) => JSON.stringify(v, (_, x) => typeof x === "bigint" ? x.toString() : x);
async function core() { return { assets: await db.asset.findMany({ orderBy: { id: "asc" }, select: { id: true, workspaceId: true, currentValueMinor: true, deletedAt: true } }), liabilities: await db.liability.findMany({ orderBy: { id: "asc" }, select: { id: true, workspaceId: true, outstandingBalanceMinor: true, monthlyPaymentMinor: true, deletedAt: true } }), transactions: await db.transaction.findMany({ orderBy: { id: "asc" } }), reservations: await db.carFundingReservation.findMany({ orderBy: { id: "asc" } }), plans: await db.carPlanVersion.findMany({ orderBy: { id: "asc" } }), decisions: await db.carDecision.findMany({ orderBy: { id: "asc" }, select: { id: true, activePlanId: true } }) }; }
it.skipIf(process.env.RUN_UNIFIED_MIGRATION !== "1")("migrates all local workspaces and preserves current financial facts", async () => {
  const before = createHash("sha256").update(encode(await core())).digest("hex");
  const workspaces = await db.workspace.findMany({ select: { id: true } });
  for (const w of workspaces) await initializeData(w.id);
  const after = createHash("sha256").update(encode(await core())).digest("hex");
  expect(after).toBe(before);
  const report = { completedAt: new Date().toISOString(), workspaceCount: workspaces.length, financialFactsUnchanged: before === after, beforeHash: before, afterHash: after, migrationIssues: await db.migrationIssue.count({ where: { status: "OPEN" } }), budgetVersions: await db.budgetVersion.count(), balanceBaselines: await db.balanceObservation.count({ where: { source: "MIGRATION_BASELINE" } }), confirmedMigrationBaselines: await db.balanceObservation.count({ where: { source: "MIGRATION_BASELINE", confirmed: true } }), reasons: await db.decisionReason.count(), constraints: await db.decisionConstraint.count(), assumptions: await db.planAssumption.count(), productVersions: await db.productVersion.count() };
  await mkdir(".local-data", { recursive: true, mode: 0o700 }); await writeFile(".local-data/business-migration-report.json", JSON.stringify(report, null, 2), { mode: 0o600 });
  expect(report.confirmedMigrationBaselines).toBe(0); await db.$disconnect();
}, 120000);
