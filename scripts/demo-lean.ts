/**
 * 把演示工作区改成"紧"的一档底账：现金 24 万、月收入 1.3 万、月支出 1.3 万。
 * 只动 demo- 开头的工作区，不碰真实数据。
 *
 * 用法：
 *   $env:DATABASE_URL='file:D:\L\assetmock\prisma\financial-associates.db'
 *   node .\node_modules\tsx\dist\cli.mjs scripts/demo-lean.ts
 */
import { db } from '../src/lib/db';
import { createBudget } from '../src/server/unified-store';
import { budgetSchema } from '../src/domain/specialist-managers';

async function main() {
  const demos = await db.workspace.findMany({ where: { id: { startsWith: 'demo-' } }, select: { id: true } });
  if (!demos.length) {
    console.log('没有演示工作区，跳过');
    return;
  }
  for (const demo of demos) {
    await db.asset.updateMany({ where: { workspaceId: demo.id, name: '演示活期资金' }, data: { currentValueMinor: 28_000_000n } });
    await db.asset.updateMany({ where: { workspaceId: demo.id, name: '演示基金账户' }, data: { currentValueMinor: 0n } });
    await db.profile.updateMany({
      where: { workspaceId: demo.id },
      data: {
        stableMonthlyIncomeMinor: 1_450_000n,
        rentExpenseMinor: 400_000n,
        transportExpenseMinor: 80_000n,
        essentialExpenseMinor: 830_000n,
      },
    });
    // 预算只能追加新版本（表上有 immutability 触发器）
    await createBudget(
      db as never,
      demo.id,
      budgetSchema.parse({
        incomeMinor: '1450000',
        livingMinor: '1320000',
        premiumsIncluded: true,
        debtIncluded: false,
        extraFixedMinor: '0',
        confirmed: true,
        note: '虚构演示预算：收入 1.45 万、支出 1.32 万，几乎没有结余（故意做成压力场景）',
      }),
      undefined,
      '演示底账改为压力场景',
    );
    console.log(`已更新演示工作区 ${demo.id}`);
  }
}

main()
  .then(() => db.$disconnect())
  .catch(async error => {
    console.error(error);
    await db.$disconnect();
    process.exitCode = 1;
  });
