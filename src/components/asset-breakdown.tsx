import { money } from '@/domain/money';
import type { PathKey, PublicPath } from '@/domain/types';

export function AssetBreakdown({ path, pathKey }: { path: PublicPath; pathKey: PathKey }) {
  const items = [
    ['cash', '现金', '可直接用于支付'],
    ['investments', '投资账户', '当前基金市值'],
  ] as const;
  return <dl className="asset-breakdown" aria-label={`${pathKey === 'cash' ? '全款' : '贷款'}路径资产构成`}>
    {items.map(([key, name, note]) => <div key={key} className={`balance-row balance-${key}`}>
      <dt>{name}<small>{note}</small></dt><dd data-testid={`${pathKey}-${key}-balance`}>¥{money(path.balances[key])}</dd>
    </div>)}
    <div className="balance-row balance-liabilities"><dt>剩余负债<small>既有分期＋车贷本金</small></dt><dd data-testid={`${pathKey}-liabilities-balance`}>¥{money(path.balances.liabilities)}</dd></div>
  <div className="balance-row balance-paid"><dt>购车累计已支付<small>含已付车贷本息，不含用车费</small></dt><dd data-testid={`${pathKey}-purchase-paid`}>¥{money(path.purchasePaid)}</dd></div>
  </dl>;
}
