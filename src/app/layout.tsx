import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import "./game.css";

const editorialFont = localFont({
  src: "./fonts/InstrumentSerif-Regular.ttf",
  variable: "--font-editorial",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI 资产管家",
  description: "以人生目标为导向的智能资产管理与财富规划产品",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body className={editorialFont.variable}>{children}</body>
    </html>
  );
}
