import type { Metadata } from "next";
import { BUSINESS_INFO, OVERSEAS_PROCESSORS, RETENTION_POLICY } from "@/lib/legal";

export const metadata: Metadata = {
  title: "개인정보처리방침 | ProfAI",
  description: "ProfAI 개인정보처리방침 (수집·이용, 국외수탁, 보유·파기, 민감정보 동의)",
};

export default function PrivacyPage() {
  const b = BUSINESS_INFO;
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-gray-800">
      <h1 className="mb-6 text-2xl font-bold">개인정보처리방침</h1>

      <h2 className="mt-8 mb-2 text-lg font-semibold">1. 수집하는 개인정보 항목 및 목적</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>계정정보(이메일·소셜 식별자): 회원 식별·로그인</li>
        <li>전화번호(선택): 결제 및 고객 응대</li>
        <li>업로드 셀카 이미지(얼굴): AI 프로필 이미지 생성(생성 외 목적 미사용)</li>
        <li>결제·거래정보: 크레딧 결제 처리 및 법령상 기록 보존</li>
      </ul>

      <h2 className="mt-8 mb-2 text-lg font-semibold">2. 민감정보(얼굴 정보)에 관한 별도 동의</h2>
      <p>
        업로드되는 얼굴 이미지는 개인을 식별할 수 있는 민감정보에 준하여 처리합니다. 회사는 「개인정보 보호법」에
        따라 이용약관 동의와 별도로 ① 개인정보(얼굴) 수집·이용 동의, ② 얼굴=민감정보 준함 별도 동의, ③ 본인
        얼굴만 업로드 확인을 각각 분리(언번들)하여 받습니다. 동의 거부 시 AI 생성 서비스 이용이 제한됩니다.
        동의 이력(버전·시각·IP)은 별도로 보관합니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">3. 보유 및 파기</h2>
      <table className="mt-2 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-gray-300">
            <th className="py-1 pr-4">항목</th>
            <th className="py-1">보유기간 / 파기</th>
          </tr>
        </thead>
        <tbody>
          {RETENTION_POLICY.map((r) => (
            <tr key={r.item} className="border-b border-gray-100">
              <td className="py-1 pr-4 align-top">{r.item}</td>
              <td className="py-1 align-top">{r.period}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="mt-2">
        업로드한 원본 셀카는 AI 생성 처리가 끝나는 즉시 파기하며, 위탁사(OpenAI·Google)에는 학습 미사용(no-training)
        및 단기 보존 후 삭제를 요청합니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">4. 개인정보의 국외 이전(국외수탁)</h2>
      <p>회사는 서비스 제공을 위해 아래와 같이 개인정보 처리를 국외 사업자에게 위탁합니다.</p>
      <table className="mt-2 w-full border-collapse text-left">
        <thead>
          <tr className="border-b border-gray-300">
            <th className="py-1 pr-3">수탁자</th>
            <th className="py-1 pr-3">국가</th>
            <th className="py-1 pr-3">목적</th>
            <th className="py-1 pr-3">항목</th>
            <th className="py-1">보유·이용기간</th>
          </tr>
        </thead>
        <tbody>
          {OVERSEAS_PROCESSORS.map((p) => (
            <tr key={p.name} className="border-b border-gray-100 align-top">
              <td className="py-1 pr-3">{p.name}</td>
              <td className="py-1 pr-3">{p.country}</td>
              <td className="py-1 pr-3">{p.purpose}</td>
              <td className="py-1 pr-3">{p.items}</td>
              <td className="py-1">{p.retention}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className="mt-8 mb-2 text-lg font-semibold">5. 이용자의 권리 및 데이터 삭제</h2>
      <p>
        이용자는 언제든지 계정 페이지(/account)에서 동의 이력 열람, 마케팅 수신 동의 변경, 회원 탈퇴 및 데이터
        영구 삭제(업로드 사진·생성 이미지·계정정보 일괄 삭제)를 요청할 수 있습니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">6. 문의처</h2>
      <p>
        개인정보 보호책임자 문의: {b.email} ({b.company})
      </p>
    </main>
  );
}
