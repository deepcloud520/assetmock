import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: '人生模拟器 · 东流', description: '购车五年，购房三十年。在平行人生中体验选择与后果。' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
