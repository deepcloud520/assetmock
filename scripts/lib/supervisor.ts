import { spawn } from "node:child_process";

/**
 * 父进程存活检查（Windows 上没有 job object 兜底，supervisor 被强杀后子进程会变孤儿）。
 *
 * 为什么需要：两个 worker 都靠"每 5–10 秒续租约"占住 DB 里的 PaperWorkerLease。
 * 一旦 supervisor 被强杀（任务管理器、Stop-Process、崩溃），worker 会继续续租约，
 * 导致下一次 `npm run dev` 启动时报"已有策略调度服务运行"并直接退出——只能重启系统。
 *
 * 这里在心跳里检查父进程：父进程没了就把自己停掉，租约在一个心跳内释放。
 */
export function supervisorAlive(): boolean {
  const ppid = process.ppid;
  if (!ppid || ppid <= 1) return true;
  try {
    process.kill(ppid, 0);
    return true;
  } catch {
    return false;
  }
}

/** 心跳里调用：父进程已退出就返回 true（调用方应停止服务） */
export function shouldStopForOrphan(): boolean {
  return !supervisorAlive();
}

/** 供测试与手工排查用 */
export function describeSupervisor(ppid = process.ppid, alive?: boolean) {
  return { ppid, alive: alive ?? supervisorAlive() };
}

void spawn;
