import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AIBox：一站式AI视频与图片生成，释放无限创意",
  description: "人人都能轻松创作AI视频与图片",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
