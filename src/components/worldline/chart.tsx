'use client';

import { useMemo } from 'react';
import type { RenderModel, RenderStrategy } from '@/domain/worldline/render-model';
import {
  CHART_HEIGHT, CHART_PAD, CHART_WIDTH, MARGINAL_GAP,
  buildMarginalBins, strategyColor, wan, type YDomain,
} from './geometry';

/** 危险程度：与策略无关，只看离门槛多远 */
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

const LEVELS = ['short', 'risk', 'tight', 'safe'] as const;
const LEVEL_LABELS: Record<(typeof LEVELS)[number], string> = {
  short: '跌破 0',
  risk: '低于门槛',
  tight: '贴线',
  safe: '有余量',
};

/**
 * 单策略面板：左边逐月分位带 + 代表线；右边"最低摸到哪"的**分布曲线**（填充色 + 概率）。
 *
 * 右侧用一条密度曲线 + 面积填充表示分布，纵向是资金、横向是密度；
 * 填充按危险程度做纵向渐变（红→橙→绿），旁边直接标"低于门槛/贴线/有余量"的占比。
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
  const marginalWidth = CHART_PAD.right - MARGINAL_GAP - 12;

  const X = (month: number) => CHART_PAD.left + (months <= 1 ? 0 : ((month - 1) / (months - 1)) * plotWidth);
  const Y = (value: number) => CHART_PAD.top + innerHeight - ((value - domain.min) / (domain.max - domain.min || 1)) * innerHeight;

  const points = model.quantilesByMonth[strategy.id] ?? [];
  const colors = strategyColor(strategy, index);
  const minima = useMemo(() => model.minUsables[strategy.id] ?? [], [model, strategy.id]);

  const marginal = useMemo(() => {
    const values = minima.length ? minima : [0];
    const low = Math.min(...values);
    const high = Math.max(...values);
    const span = Math.max(1, high - low);
    const min = low - span * 0.08;
    const max = high + span * 0.08;
    const bins = buildMarginalBins(values, { min, max }, 32);
    return { min, max, bins };
  }, [minima]);

  const YM = (value: number) => CHART_PAD.top + innerHeight - ((value - marginal.min) / (marginal.max - marginal.min || 1)) * innerHeight;

  /** 分布曲线：从底部沿密度折线走到顶部，再回到底部闭合，整体填充 */
  const curve = marginal.bins.length
    ? `M${marginalX},${YM(marginal.min)} ` +
      marginal.bins
        .map(bin => `L${marginalX + Math.max(0.6, Math.min(1, bin.density) * marginalWidth)},${YM((bin.from + bin.to) / 2)}`)
        .join(' ') +
      ` L${marginalX},${YM(marginal.max)} Z`
    : '';

  /** 概率：按这条策略自己的最低值落在哪一档统计 */
  const shares = useMemo(() => {
    const total = minima.length || 1;
    const counts = { short: 0, risk: 0, tight: 0, safe: 0 };
    for (const value of minima) counts[dangerLevelOf(value, strategy.floorMinor)] += 1;
    return LEVELS.map(level => ({ level, percent: Math.round((counts[level] / total) * 100) }));
  }, [minima, strategy.floorMinor]);

  const gradientId = `wl-danger-${strategy.id}`;
  const stopAt = (value: number) => {
    const ratio = (value - marginal.min) / (marginal.max - marginal.min || 1);
    return `${Math.max(0, Math.min(100, (1 - ratio) * 100)).toFixed(1)}%`;
  };

  const line = (pick: (point: { p5: number; p50: number; p90: number }) => number) => points.map((point, i) => `${i === 0 ? 'M' : 'L'}${X(i + 1)},${Y(pick(point))}`).join(' ');
  const bandArea = points.length < 2 ? '' : `${line(point => point.p90)} ${[...points].reverse().map((point, i) => `L${X(points.length - i)},${Y(point.p5)}`).join(' ')} Z`;

  const ticks = useMemo(() => {
    const count = 4;
    return Array.from({ length: count + 1 }, (_, i) => domain.min + ((domain.max - domain.min) * i) / count);
  }, [domain]);

  return <figure className="wl-panel">
    <figcaption>
      <strong>{strategy.id.toUpperCase()} · {strategy.label}（{index === 0 ? '实线' : '虚线'}）</strong>
      <span>门槛 {wan(strategy.floorMinor)} · P50 {wan(strategy.p50)}</span>
    </figcaption>
    <svg viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`} role="img" aria-label={`${strategy.label}的逐月分位带与最低值分布`}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={DANGER_COLORS.safe} stopOpacity={0.55} />
          <stop offset={stopAt(strategy.floorMinor * 1.25)} stopColor={DANGER_COLORS.safe} stopOpacity={0.5} />
          <stop offset={stopAt(strategy.floorMinor * 1.25)} stopColor={DANGER_COLORS.tight} stopOpacity={0.55} />
          <stop offset={stopAt(strategy.floorMinor)} stopColor={DANGER_COLORS.tight} stopOpacity={0.6} />
          <stop offset={stopAt(strategy.floorMinor)} stopColor={DANGER_COLORS.risk} stopOpacity={0.65} />
          <stop offset={stopAt(0)} stopColor={DANGER_COLORS.risk} stopOpacity={0.7} />
          <stop offset={stopAt(0)} stopColor={DANGER_COLORS.short} stopOpacity={0.8} />
          <stop offset="100%" stopColor={DANGER_COLORS.short} stopOpacity={0.85} />
        </linearGradient>
      </defs>

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
        <path d={line(point => point.p50)} fill="none" stroke={colors} strokeWidth={1.6} />
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

      {/* 右侧：最低值分布曲线（填充按危险程度渐变） */}
      <line x1={marginalX} x2={marginalX} y1={CHART_PAD.top} y2={CHART_PAD.top + innerHeight} className="wl-marginal-axis" />
      {curve && <path d={curve} fill={`url(#${gradientId})`} stroke="#6b7f93" strokeWidth={0.9} strokeOpacity={0.7} />}
      <line x1={marginalX} x2={marginalX + marginalWidth} y1={YM(strategy.floorMinor)} y2={YM(strategy.floorMinor)} stroke={DANGER_COLORS.tight} strokeWidth={1.1} strokeDasharray="4 3" />
      <text x={marginalX + marginalWidth} y={YM(strategy.floorMinor) - 3} textAnchor="end" className="wl-axis">门槛</text>

      {/* 概率：直接写在曲线右侧 */}
      {shares.map((share, i) => (
        <text key={share.level}
          x={marginalX + marginalWidth + 4}
          y={CHART_PAD.top + 12 + i * 13}
          className="wl-prob"
          fill={DANGER_COLORS[share.level]}>
          {LEVEL_LABELS[share.level]} {share.percent}%
        </text>
      ))}
      <text x={marginalX + marginalWidth + 4} y={CHART_PAD.top + 12 + shares.length * 13} className="wl-axis">最低值分布</text>
    </svg>
    <p className="wl-legend-line">
      {LEVELS.map(level => <span key={level}>
        <i style={{ background: DANGER_COLORS[level] }} />
        {LEVEL_LABELS[level]}
      </span>)}
      <span>{wan(marginal.min)}–{wan(marginal.max)}</span>
    </p>
  </figure>;
}
