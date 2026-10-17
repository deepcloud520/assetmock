'use client';

import { useMemo } from 'react';
import type { RenderModel } from '@/domain/worldline/render-model';
import { yuan } from './geometry';

const W = 760;
const H = 300;
const PAD = { top: 18, right: 16, bottom: 28, left: 64 };

const eventLabels: Record<string, string> = {
  medical: '医疗', jobLoss: '收入中断', bonusDelay: '奖金延期', marketDrop: '投资下跌', career: '职业机会',
};

/**
 * 第二条界面：**一条世界线，两条策略**逐月对比。
 * 这是先把"一段人生"看清楚：两条线怎么走、门槛在哪、哪个月跌破、事件发生在哪。
 */
export function SampleLineChart({ model }: { model: RenderModel }) {
  const months = model.meta.months;
  const sample = model.sample;
  const plotWidth = W - PAD.left - PAD.right;
  const plotHeight = H - PAD.top - PAD.bottom;

  const domain = useMemo(() => {
    const values = [...Object.values(sample.series).flat(), ...Object.values(sample.byStrategy).map(item => item.floorMinor), 0];
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = Math.max(1, max - min);
    return { min: min - span * 0.06, max: max + span * 0.06 };
  }, [sample]);

  const X = (month: number) => PAD.left + (months <= 1 ? 0 : ((month - 1) / (months - 1)) * plotWidth);
  const Y = (value: number) => PAD.top + plotHeight - ((value - domain.min) / (domain.max - domain.min || 1)) * plotHeight;
  const colors = ['#23669d', '#c2571a'];

  const ticks = Array.from({ length: 5 }, (_, index) => domain.min + ((domain.max - domain.min) * index) / 4);
  const strategies = Object.entries(sample.series);
  const yearTicks = Array.from({ length: Math.floor(months / 12) + 1 }, (_, index) => index * 12).filter(month => month >= 1 && month <= months);

  return <figure className="wl-sample">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="这一条世界线里两种策略的逐月剩余资金">
      {ticks.map(tick => <g key={tick}>
        <line x1={PAD.left} x2={W - PAD.right} y1={Y(tick)} y2={Y(tick)} className="wl-grid" />
        <text x={PAD.left - 8} y={Y(tick) + 3.5} textAnchor="end" className="wl-axis">{(tick / 100).toLocaleString('zh-CN', { maximumFractionDigits: 0 })}元</text>
      </g>)}
      <line x1={PAD.left} x2={W - PAD.right} y1={Y(0)} y2={Y(0)} className="wl-zero" />

      {yearTicks.map(month => <g key={`y${month}`}>
        <line x1={X(month)} x2={X(month)} y1={PAD.top} y2={PAD.top + plotHeight} className="wl-year" />
        <text x={X(month)} y={H - 8} textAnchor="middle" className="wl-axis">第{month}月</text>
      </g>)}

      {Object.entries(sample.byStrategy).map(([id, strategy], index) => (
        <line key={`floor-${id}`} x1={PAD.left} x2={W - PAD.right} y1={Y(strategy.floorMinor)} y2={Y(strategy.floorMinor)}
          stroke={colors[index]} strokeWidth={1} strokeDasharray="6 4" strokeOpacity={0.55} />
      ))}
      {Object.entries(sample.byStrategy).map(([id, strategy], index) => (
        <text key={`fl-${id}`} x={W - PAD.right - 2} y={Y(strategy.floorMinor) - 4} textAnchor="end" className="wl-axis" fill={colors[index]}>
          {id.toUpperCase()} 门槛 {yuan(strategy.floorMinor)} 元
        </text>
      ))}

      {sample.events.map(event => <g key={`${event.kind}-${event.month}`}>
        <line x1={X(event.month)} x2={X(event.month)} y1={PAD.top} y2={PAD.top + plotHeight} className="wl-event-line" />
        <circle cx={X(event.month)} cy={PAD.top} r={2.4} className="wl-event-dot" />
        <text x={X(event.month)} y={PAD.top - 6} textAnchor="middle" className="wl-axis">{eventLabels[event.kind] ?? event.kind}</text>
      </g>)}

      {strategies.map(([id, series], index) => series.length > 1 && (
        <path key={id} d={series.map((value, month) => `${month === 0 ? 'M' : 'L'}${X(month + 1)},${Y(value)}`).join(' ')}
          fill="none" stroke={colors[index]} strokeWidth={2.2} strokeLinejoin="round" />
      ))}
    </svg>
    <figcaption>
      {Object.entries(sample.byStrategy).map(([id, strategy]) => <span key={id}>
        <i style={{ background: colors[Object.keys(sample.byStrategy).indexOf(id)] }} />
        {id.toUpperCase()} · {strategy.label}：最低 {yuan(strategy.minUsable)} 元
        {strategy.firstShortfall ? `，第 ${strategy.firstShortfall.month} 月开始不够` : '，全程没断'}
      </span>)}
    </figcaption>
  </figure>;
}
