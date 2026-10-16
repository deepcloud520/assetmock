'use client';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { PublicRun } from '@/domain/types';

export function WealthChart({ run }: { run: PublicRun }) {
  return <div className="chart" role="img" aria-label="全款与贷款净资产随月份变化的折线图；数据可在下方月份记录查看">
    <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 600, height: 290 }}>
      <LineChart data={run.timeline} margin={{ top: 18, right: 24, left: 0, bottom: 4 }}>
        <CartesianGrid stroke="#e6ecf3" vertical={false} />
        <XAxis dataKey="month" type="number" domain={[0, 12]} ticks={[0, 2, 4, 6, 8, 10, 12]} tickFormatter={v => v === 0 ? '购车' : `第${v}月`} axisLine={false} tickLine={false} tick={{ fill: '#607089', fontSize: 12 }} />
        <YAxis domain={['auto', 'auto']} tickFormatter={v => `${(Number(v) / 1000000).toFixed(1)}万`} width={65} axisLine={false} tickLine={false} tick={{ fill: '#607089', fontSize: 12 }} />
        <Tooltip labelFormatter={v => Number(v) === 0 ? '开局购车后' : `第 ${v} 个月`} formatter={(v, name) => [`¥${(Number(v) / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`, name === 'cash' ? '全款路径' : '贷款路径']} contentStyle={{ borderRadius: 12, border: '1px solid #dbe5f0', fontSize: 13 }} />
        <Line type="linear" dataKey="cash" stroke="#267DFF" strokeWidth={3} dot={{ r: 3, fill: '#267DFF' }} isAnimationActive={false} connectNulls={false} />
        <Line type="linear" dataKey="loan" stroke="#F2881B" strokeWidth={3} strokeDasharray="7 4" dot={{ r: 3, fill: '#F2881B' }} isAnimationActive={false} connectNulls={false} />
      </LineChart>
    </ResponsiveContainer>
  </div>;
}
