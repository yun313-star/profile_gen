import Link from "next/link";
import { BUSINESS_INFO, REFUND_POLICY } from "@/lib/legal";

export function SiteFooter() {
  const b = BUSINESS_INFO;
  return (
    <footer className="mt-16 border-t border-gray-200 bg-gray-50 px-4 py-8 text-xs leading-relaxed text-gray-500">
      <div className="mx-auto max-w-3xl space-y-3">
        <nav className="flex flex-wrap gap-4 font-medium text-gray-700">
          <Link href="/legal/terms">이용약관</Link>
          <Link href="/legal/privacy">개인정보처리방침</Link>
          <a href={`mailto:${b.email}`}>고객센터</a>
        </nav>
        <div className="space-y-0.5">
          <p>
            {b.serviceName} · 상호: {b.company} · 대표: {b.ceo}
          </p>
          <p>
            사업자등록번호: {b.bizRegNo} · 통신판매업신고번호: {b.mailOrderNo}
          </p>
          <p>
            주소: {b.address} · 문의: {b.email}
            {b.phone ? ` · ${b.phone}` : ""}
          </p>
        </div>
        <p className="text-gray-400">{REFUND_POLICY.summary}</p>
        <p className="text-gray-400">© {new Date().getFullYear()} {b.serviceName}. All rights reserved.</p>
      </div>
    </footer>
  );
}
