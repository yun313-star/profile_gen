export const BUSINESS_INFO = {
  serviceName: "ProfAI",
  company: "차밍",
  ceo: "허윤",
  bizRegNo: "499-40-00623",
  // ★ still required: not on the 사업자등록증 — fill from the 통신판매업 신고증.
  mailOrderNo: "★통신판매업신고번호 입력",
  address: "서울특별시 강남구 논현로 661, 1303호",
  email: "support@profai.kr",
  // ★ still required: customer-service phone (not on the 사업자등록증).
  phone: "★대표 전화번호 입력",
} as const;

export type OverseasProcessor = {
  name: string;
  country: string;
  purpose: string;
  items: string;
  retention: string;
};

export const OVERSEAS_PROCESSORS: readonly OverseasProcessor[] = [
  {
    name: "OpenAI, L.L.C.",
    country: "미국",
    purpose: "AI 이미지 생성(images.edit)",
    items: "이용자가 업로드한 셀카 이미지",
    retention: "생성 처리 직후 즉시 파기(no-training·단기보존 요청)",
  },
  {
    name: "Google LLC",
    country: "미국",
    purpose: "AI 이미지 생성(Gemini, Vercel AI Gateway 경유)",
    items: "이용자가 업로드한 셀카 이미지",
    retention: "생성 처리 직후 즉시 파기(no-training·단기보존 요청)",
  },
  {
    name: "Supabase, Inc.",
    country: "미국/싱가포르",
    purpose: "인증·데이터베이스·이미지 스토리지",
    items: "계정정보, 생성 결과 이미지",
    retention: "회원 탈퇴 또는 이용자 삭제 요청 시까지",
  },
  {
    name: "Vercel, Inc.",
    country: "미국",
    purpose: "애플리케이션 호스팅·서버 처리",
    items: "서비스 이용 트래픽(처리 시 일시적)",
    retention: "요청 처리 직후",
  },
  {
    name: "주식회사 페이앱(PayApp)",
    country: "대한민국",
    purpose: "신용카드·간편결제 등 결제 처리",
    items: "주문·결제 정보",
    retention: "전자상거래 등 관계법령이 정한 보존기간",
  },
] as const;

export type RetentionItem = { item: string; period: string };

export const RETENTION_POLICY: readonly RetentionItem[] = [
  { item: "업로드 셀카(원본)", period: "AI 생성 처리 직후 즉시 파기(보존 시에도 최대 N일 내 자동 삭제)" },
  { item: "생성 결과 이미지", period: "회원 탈퇴 또는 이용자 삭제 요청 시까지" },
  { item: "결제·거래 기록", period: "전자상거래 등에서의 소비자보호에 관한 법률에 따라 5년" },
  { item: "동의 이력", period: "회원 탈퇴 후 관계법령이 정한 보존기간" },
] as const;

export const REFUND_POLICY = {
  summary:
    "미사용 크레딧은 환불 가능합니다. 이미 사용(생성에 차감)된 크레딧은 디지털 콘텐츠 제공이 완료된 것으로 보아 청약철회가 제한될 수 있으며, 이는 결제 전 고지·동의를 받습니다.",
  steps: [
    "환불 요청은 고객센터 이메일(support@profai.kr)로 접수합니다.",
    "미사용 크레딧 잔액을 기준으로 원결제수단 취소 또는 환급으로 처리합니다.",
    "결제대행(PayApp)을 통한 취소는 영업일 기준 약 3~5일 소요될 수 있습니다.",
  ],
} as const;

export const AI_LABEL_TEXT = "AI 생성";
export const AI_DISCLOSURE_TEXT =
  "본 서비스는 AI로 이미지를 생성합니다. 생성된 모든 이미지에는 'AI 생성' 표시가 포함됩니다.";
