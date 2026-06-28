import type { Metadata } from "next";
import { BUSINESS_INFO, REFUND_POLICY } from "@/lib/legal";

export const metadata: Metadata = {
  title: "이용약관 | ProfAI",
  description: "ProfAI 서비스 이용약관",
};

export default function TermsPage() {
  const b = BUSINESS_INFO;
  return (
    <main className="mx-auto max-w-3xl px-4 py-12 text-sm leading-relaxed text-gray-800">
      <h1 className="mb-6 text-2xl font-bold">이용약관</h1>

      <h2 className="mt-8 mb-2 text-lg font-semibold">제1조 (목적)</h2>
      <p>
        본 약관은 {b.company}(이하 "회사")가 제공하는 {b.serviceName} 서비스(AI 프로필 이미지 생성)의 이용
        조건과 절차, 회사와 이용자의 권리·의무 및 책임사항을 규정함을 목적으로 합니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">제2조 (서비스의 성격 및 AI 고지)</h2>
      <p>
        본 서비스는 인공지능(AI) 모델을 이용해 이용자가 업로드한 셀카를 참조하여 프로필 이미지를 생성합니다.
        생성된 모든 이미지에는 사람이 인지 가능한 'AI 생성' 표시가 포함되며, 이는 인공지능기본법에 따른
        고지 의무를 이행하기 위한 것입니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">제3조 (본인 얼굴 업로드 의무)</h2>
      <p>
        이용자는 본인의 얼굴 사진만 업로드해야 하며, 타인·유명인 등 제3자의 얼굴을 업로드해서는 안 됩니다.
        만 14세 미만 아동은 서비스를 이용할 수 없습니다. 위반 시 회사는 사전 통지 없이 이용을 제한할 수 있습니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">제4조 (크레딧 및 결제)</h2>
      <p>
        서비스는 크레딧을 통해 이용하며, 1크레딧은 2K 해상도 결과 이미지 1장 생성에 사용됩니다. 결제는 결제대행사
        페이앱(PayApp)을 통해 처리됩니다. 결제 금액·구성은 결제 전 화면에 고지됩니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">제5조 (청약철회 및 환불)</h2>
      <p>{REFUND_POLICY.summary}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {REFUND_POLICY.steps.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>
      <p className="mt-2">
        이미 생성에 사용(차감)된 크레딧은 「전자상거래 등에서의 소비자보호에 관한 법률」 제17조 제2항에 따라
        디지털 콘텐츠 제공이 개시된 것으로 보아 청약철회가 제한될 수 있으며, 회사는 이를 결제 전 명확히 고지하고
        이용자의 동의를 받습니다. 미사용 크레딧은 언제든 환불을 요청할 수 있습니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">제6조 (금지행위)</h2>
      <p>
        타인 사칭, 불법·음란(NSFW)·혐오 콘텐츠 생성 시도, 자동화된 대량 요청 등은 금지되며 위반 시 이용이 제한될
        수 있습니다. 신고 및 게시중단(테이크다운) 요청은 {b.email} 으로 접수할 수 있습니다.
      </p>

      <h2 className="mt-8 mb-2 text-lg font-semibold">제7조 (사업자 정보)</h2>
      <p>
        상호: {b.company} · 대표: {b.ceo} · 사업자등록번호: {b.bizRegNo} · 통신판매업신고번호: {b.mailOrderNo} ·
        주소: {b.address} · 문의: {b.email}
      </p>
    </main>
  );
}
