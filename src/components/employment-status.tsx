import { money } from '@/domain/money';
import type { PublicRun } from '@/domain/types';

export function EmploymentStatus({ month }: { month: PublicRun['months'][number] }) {
  const { employment: job } = month;
  return <section className={`employment-status ${month.unemployed ? 'job-seeking' : ''}`} aria-label="就业与收入">
    <h3>{month.unemployed ? '持续求职中' : job.resumed ? '本月重新就业' : '当前在职'}</h3>
    {month.unemployed && <p>含本月还需停薪 {job.monthsRemaining} 个月；按本局规则，第 {month.month + job.monthsRemaining} 个月重新就业。</p>}
    <p>{job.salary === null ? '本月支付失败，收入未提交结算。' : <>本月工资：<strong>¥{money(job.salary)}</strong></>}</p>
    {job.bonus !== null && job.bonus > 0 && <p>本月奖金：<strong>¥{money(job.bonus)}</strong>{month.unemployed && <><br />奖金按原定计划到账，不代表工资恢复。</>}</p>}
    {!month.unemployed && !job.resumed && month.events.every(e => e.kind !== 'jobLoss') && <small>按本局当前工资结算，重新就业后的工资会持续生效。</small>}
  </section>;
}
