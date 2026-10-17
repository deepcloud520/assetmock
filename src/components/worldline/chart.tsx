'use client';

import { useMemo } from 'react';
import type { RenderModel, RenderStrategy } from '@/domain/worldline/render-model';
import {
  CHART_HEIGHT, CHART_PAD, CHART_WIDTH, MARGINAL_GAP, bandColor,
  buildMarginalBins, strategyColor, wan, type YDomain,
} from './geometry';

/**
 * 单策略面板：左边逐月分位带 + 代表线，右边"这条线最低摸到哪"的分布。
 *
 * 右侧分布**用自己的纵轴**（原先和左图共用一条轴，结果整段分布被压成一条细缝，
 * 全款和低首付看起来一模一样）；颜色用策略色区分，A 蓝 B 橙。
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
  const bandOfMin = (value: number) => (value < 0 ? bandColor.bad : value < strategy.floorMinor ? bandColor.tight : bandColor.ok);

  const line = (pick: (point: { p5: number; p50: number; p90: number }) => number) => points.map((point, i) => `${i === 0 ? 'M' : 'L'}${X(i + 1)},${Y(pick(point))}`).join(' ');
  const bandArea = points.length < 2 ? '' : `${line(point => point.p90)} ${[...points].reverse().map((point, i) => `L${X(points.length - i)},${Y(point.p5)}`).join(' ')} Z`;
  const medianLine = line(point => point.p50);

  const ticks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => domain.min + ((domain.max - domain.min) * i) / count);
  }, [domain]);

  return <figure className="wl-panel">
    <figcaption>
      <strong><i className="wl-dot" style={{ background: colors }} />{strategy.id.toUpperCase()} · {strategy.label}（{index === 0 ? '实线' : '虚线'}）</strong>
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
        const color = bandColor[candidate.band] ?? colors;
        return <path key={candidate.id}
          d={series.map((value, i) => `${i === 0 ? 'M' : 'L'}${X(i + 1)},${Y(value)}`).join(' ')}
          fill="none" stroke={color} strokeWidth={1.2} strokeOpacity={0.75} />;
      })}

      <line x1={X(cursor)} x2={X(cursor)} y1={CHART_PAD.top} y2={CHART_PAD.top + innerHeight} className="wl-cursor" />
      <text x={X(cursor)} y={CHART_PAD.top - 4} textAnchor="middle" className="wl-axis">第{cursor}月</text>

      {/* 右侧：分布（自己的纵轴，柱子用策略色） */}
      <line x1={marginalX} x2={marginalX} y1={CHART_PAD.top} y2={CHART_PAD.top + innerHeight} className="wl-marginal-axis" />
      {marginal.bins.map((bin, i) => {
        const height = innerHeight / marginal.bins.length;
        return <rect key={i}
          x={marginalX}
          y={YM(bin.to)}
          width={Math.max(0.5, bin.density * marginalWidth)}
          height={Math.max(0.6, height - 0.6)}
          fill={colors}
          opacity={0.5}
        />;
      })}
      <line x1={marginalX} x2={marginalX + marginalWidth} y1={YM(strategy.floorMinor)} y2={YM(strategy.floorMinor)} stroke={bandColor.tight} strokeWidth={1.2} strokeDasharray="4 3" />
      <text x={marginalX + marginalWidth} y={YM(strategy.floorMinor) - 3} textAnchor="end" className="wl-axis">门槛</text>

      {/* 极值与颜色说明：这条线最低摸到多少，在分布里的位置用档位色标出 */}
      {minima.length > 0 && <>
        <rect x={marginalX + marginalWidth - 4} y={YM(Math.min(...minima)) - 3} width={4} height={6} fill={bandOfMin(Math.min(...minima))} />
        <rect x={marginalX + marginalWidth - 4} y={YM(Math.max(...minima)) - 3} width={4} height={6} fill={bandOfMin(Math.max(...minima))} />
        <text x={marginalX + marginalWidth} y={CHART_PAD.top + 8} textAnchor="end" className="wl-axis">最低值分布</text>
        <text x={marginalX + marginalWidth} y={CHART_PAD.top + 18} textAnchor="end" className="wl-axis">{wan(marginal.min)}–{wan(marginal.max)}</text>
      </>}
    </svg>
  </figure>;
}
