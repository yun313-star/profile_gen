import type { Metadata } from "next";
import "./globals.css";
import { Nav } from "@/components/nav";

export const metadata: Metadata = {
  title: "ProfAI — AI 프로필 사진 생성기",
  description: "셀카 1~3장으로 비즈·증명사진부터 컨셉 화보까지. AI 프로필 사진을 즉석 생성.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-screen bg-white text-neutral-900 antialiased">
        <Nav />
        <main className="mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
