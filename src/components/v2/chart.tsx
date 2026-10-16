'use client';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PublicRun } from '@/domain/v2/types';
export function Timeline({ run }: { run: PublicRun }) {
  return <div className="v2-chart" role="img" aria-label="两条路径的剩余资金时间线，月度数据见历史记录">
    <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 800, height: 270 }}>
      <LineChart data={run.timeline} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
        <CartesianGrid vertical={false} stroke="#dce5f0" /><XAxis dataKey="month" type="number" domain={[0, Math.max(12, run.month)]} tickFormatter={v => `${Number(v) / 12}年`} /><YAxis width={70} tickFormatter={v => `${(Number(v) / 1000000).toFixed(0)}万`} />
        <Tooltip labelFormatter={v => `第${v}月`} formatter={(v, name) => [`${(Number(v) / 100).toLocaleString('zh-CN', { maximumFractionDigits: 2 })}元`, name]} />
        <Line name={`A ${run.plans.a.label}`} dataKey="a" stroke="#267DFF" strokeWidth={3} dot={false} connectNulls={false} isAnimationActive={false} />
        <Line name={`B ${run.plans.b.label}`} dataKey="b" stroke="#FF5D00" strokeWidth={3} strokeDasharray="6 4" dot={false} connectNulls={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
