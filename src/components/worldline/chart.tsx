'use client';

import { useMemo } from 'react';
import type { RenderModel, RenderStrategy } from '@/domain/worldline/render-model';
import {
  CHART_HEIGHT, CHART_PAD, CHART_WIDTH, MARGINAL_GAP,
  buildMarginalBins, strategyColor, wan, type YDomain,
} from './geometry';

/** 危险程度四档：红=已经不够 / 朱=逼近门槛 / 橙=贴线 / 绿=有余量。与策略无关，只看离门槛多远 */
export const DANGER_COLORS = {
  short: '#a51f1a',
  risk: '#d2453f',
  tight: '#e08a1e',
  safe: '#1f9d6b',
} as const;

export function dangerLevelOf(minor: number, floorMinor: number): keyof typeof DANGER_COLORS {
  if (minor < 0) return 'short';
  if (minor < floorMinor) return 'risk';
  if (minor < floorMinor * 1.25) return 'tight';
  return 'safe';
}

export function dangerColorOf(minor: number, floorMinor: number): string {
  return DANGER_COLORS[dangerLevelOf(minor, floorMinor)];
}

/**
 * 单策略面板：左边逐月分位带 + 代表线，右边"这条线最低摸到哪"的分布。
 *
 * 染色规则：**按危险程度**（离门槛多远），不按策略。
 * 右侧分布用自己的纵轴——原先与左图共用一条轴，整段分布被压成一条细缝，
 * 两种策略看起来一模一样。
 */
export function StrategyPanel({ model, strategy, index, domain, cursor }: {
  model: RenderModel;
  strategy: RenderStrategy;
  index: number;
  domain: YDomain;
  cursor: number;
}) {
  const months = model.meta.months;
  const plotRight = CHART_WIDTH - CHART_PAD.right;
  const plotWidth = plotRight - CHART_PAD.left;
  const innerHeight = CHART_HEIGHT - CHART_PAD.top - CHART_PAD.bottom;
  const marginalX = plotRight + MARGINAL_GAP;
  const marginalWidth = CHART_PAD.right - MARGINAL_GAP - 6;

  const X = (month: number) => CHART_PAD.left + (months <= 1 ? 0 : ((month - 1) / (months - 1)) * plotWidth);
  const Y = (value: number) => CHART_PAD.top + innerHeight - ((value - domain.min) / (domain.max - domain.min || 1)) * innerHeight;

  const points = model.quantilesByMonth[strategy.id] ?? [];
  const colors = strategyColor(strategy, index);
  const minima = useMemo(() => model.minUsables[strategy.id] ?? [], [model, strategy.id]);

  // 分布自己的纵向范围：只覆盖这条策略真正摸到过的区间，两端各留 8%
  const marginal = useMemo(() => {
    const values = minima.length ? minima : [0];
    const low = Math.min(...values);
    const high = Math.max(...values);
    const span = Math.max(1, high - low);
    const min = low - span * 0.08;
    const max = high + span * 0.08;
    const bins = buildMarginalBins(values, { min, max }, 28);
    return { min, max, bins };
  }, [minima]);

  const YM = (value: number) => CHART_PAD.top + innerHeight - ((value - marginal.min) / (marginal.max - marginal.min || 1)) * innerHeight;

  const line = (pick: (point: { p5: number; p50: number; p90: number }) => number) => points.map((point, i) => `${i === 0 ? 'M' : 'L'}${X(i + 1)},${Y(pick(point))}`).join(' ');
  const bandArea = points.length < 2 ? '' : `${line(point => point.p90)} ${[...points].reverse().map((point, i) => `L${X(points.length - i)},${Y(point.p5)}`).join(' ')} Z`;
  const medianLine = line(point => point.p50);

  const ticks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => domain.min + ((domain.max - domain.min) * i) / count);
  }, [domain]);

  return <figure className="wl-panel">
    <figcaption>
      <strong>{strategy.id.toUpperCase()} · {strategy.label}（{index === 0 ? '实线' : '虚线'}）</strong>
      <span>门槛 {wan(strategy.floorMinor)} · P50 {wan(strategy.p50)}</span>
    </figcaption>
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={`${strategy.label}的逐月可用资金分位带与最低值分布`}>
      {ticks.map(tick => <g key={tick}>
        <line x1={CHART_PAD.left} x2={plotRight} y1={Y(tick)} y2={Y(tick)} className="wl-grid" />
        <text x={CHART_PAD.left - 6} y={Y(tick) + 3.5} textAnchor="end" className="wl-axis">{wan(tick)}</text>
      </g>)}
      <line x1={CHART_PAD.left} x2={plotRight} y1={Y(0)} y2={Y(0)} className="wl-zero" />
      <text x={CHART_PAD.left + 2} y={Y(0) - 4} className="wl-axis">0</text>

      {bandArea && <path d={bandArea} fill={colors} opacity={0.12} stroke="none" />}
      {points.length > 1 && <>
        <path d={points.map((point, i) => `${i === 0 ? 'M' : 'L'}${X(i + 1)},${Y(point.p90)}`).join(' ')} fill="none" stroke={colors} strokeOpacity={0.4} strokeWidth={1} strokeDasharray="4 4" />
        <path d={points.map((point, i) => `${i === 0 ? 'M' : 'L'}${X(i + 1)},${Y(point.p5)}`).join(' ')} fill="none" stroke={colors} strokeOpacity={0.4} strokeWidth={1} strokeDasharray="4 4" />
        <path d={medianLine} fill="none" stroke={colors} strokeWidth={1.6} />
      </>}

      {model.candidates.map(candidate => {
        const series = candidate.series[strategy.id] ?? [];
        if (series.length < 2) return null;
        return <path key={candidate.id}
          d={series.map((value, i) => `${i === 0 ? 'M' : 'L'}${X(i + 1)},${Y(value)}`).join(' ')}
          fill="none" stroke={dangerColorOf(candidate.byStrategy[strategy.id]?.minBalanceMinor ?? 0, strategy.floorMinor)} strokeWidth={1.2} strokeOpacity={0.75} />;
      })}

      <line x1={X(cursor)} x2={X(cursor)} y1={CHART_PAD.top} y2={CHART_PAD.top + innerHeight} className="wl-cursor" />
      <text x={X(cursor)} y={CHART_PAD.top - 4} textAnchor="middle" className="wl-axis">第{cursor}月</text>

      {/* 右侧：分布（自己的纵轴），柱子按危险程度上色 */}
      <line x1={marginalX} x2={marginalX} y1={CHART_PAD.top} y2={CHART_PAD.top + innerHeight} className="wl-marginal-axis" />
      {marginal.bins.map((bin, i) => {
        const height = innerHeight / marginal.bins.length;
        return <rect key={i}
          x={marginalX}
          y={YM(bin.to)}
          width={Math.max(0.5, bin.density * marginalWidth)}
          height={Math.max(0.6, height - 0.6)}
          fill={dangerColorOf(bin.from, strategy.floorMinor)}
          opacity={0.8}
        />;
      })}
      <line x1={marginalX} x2={marginalX + marginalWidth} y1={YM(strategy.floorMinor)} y2={YM(strategy.floorMinor)} stroke={DANGER_COLORS.tight} strokeWidth={1.2} strokeDasharray="4 3" />
      <text x={marginalX + marginalWidth} y={YM(strategy.floorMinor) - 3} textAnchor="end" className="wl-axis">门槛</text>

      {minima.length > 0 && <>
        <text x={marginalX + marginalWidth} y={CHART_PAD.top + innerHeight + 12} textAnchor="end" className="wl-axis">最低值分布</text>
        <text x={marginalX + marginalWidth} y={CHART_PAD.top + innerHeight + 21} textAnchor="end" className="wl-axis">{wan(marginal.min)}–{wan(marginal.max)}</text>
      </>}
    </svg>
    <p className="wl-legend-line">
      {(['short', 'risk', 'tight', 'safe'] as const).map(level => <span key={level}>
        <i style={{ background: DANGER_COLORS[level] }} />
        {level === 'short' ? '已经不够' : level === 'risk' ? '低于门槛' : level === 'tight' ? '贴线（1.25 倍内）' : '有余量'}
      </span>)}
    </p>
  </figure>;
}
