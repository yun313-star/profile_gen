import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { Nav } from "@/components/nav";
import { AiDisclosureBanner } from "@/components/AiDisclosureBanner";
import { SiteFooter } from "@/components/SiteFooter";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_BASE_URL ?? "https://profai.kr"),
  title: { default: "ProfAI — AI 프로필 사진 생성기", template: "%s | ProfAI" },
  description: "셀카 한 장으로 비즈니스·증명사진부터 컨셉 화보까지, AI가 만들어 주는 프로필 사진.",
  applicationName: "ProfAI",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "ProfAI", statusBarStyle: "default" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  openGraph: {
    title: "ProfAI — AI 프로필 사진 생성기",
    description: "셀카 한 장으로 만드는 AI 프로필 사진",
    type: "website",
    locale: "ko_KR",
  },
};

export const viewport: Viewport = { themeColor: "#4f46e5" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="flex min-h-screen flex-col bg-white text-neutral-900 antialiased">
        <AiDisclosureBanner />
        <Nav />
        <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
        <SiteFooter />
        <Analytics />
      </body>
    </html>
  );
}
