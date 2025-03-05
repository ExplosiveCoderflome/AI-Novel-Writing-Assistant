/*
 * @LastEditors: biz
 */
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";
import { Providers } from './providers';
import { Navbar } from './components/Navbar';
import { Toaster } from "./components/ui/toaster";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AI Novel Writing Assistant",
  description: "一个专注于小说创作的AI辅助写作平台",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Navbar />
            <main className="flex-1">
              {children}
            </main>
          </div>
          <Analytics />
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
