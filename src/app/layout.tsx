import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '人生模拟器 · 东流', description: '同一段人生，两种购车选择。' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
