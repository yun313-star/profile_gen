import Link from "next/link";
import { FREE_SIGNUP_CREDITS, STYLE_FAMILIES } from "@/lib/styles";

const FAMILY_LABELS: Record<(typeof STYLE_FAMILIES)[number], string> = {
  business: "비즈·증명사진",
  editorial: "컨셉 화보",
  sns: "SNS 감성",
  fantasy: "판타지·아트",
};

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center gap-10 py-10 text-center">
      <section className="flex flex-col items-center gap-4">
        <p className="rounded-full bg-neutral-100 px-3 py-1 text-xs font-medium">
          가입 즉시 무료 {FREE_SIGNUP_CREDITS}크레딧
        </p>
        <h1 className="max-w-2xl text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
          셀카 한 장이면, 프로필 사진이 완성됩니다
        </h1>
        <p className="max-w-xl text-neutral-600">
          AI가 셀카를 레퍼런스로 비즈·증명사진부터 컨셉 화보까지 즉석 생성. 별도 학습 없이 바로.
        </p>
        <Link
          href="/login"
          className="mt-2 rounded-lg bg-neutral-900 px-6 py-3 font-semibold text-white"
        >
          무료로 시작하기
        </Link>
        <p className="text-xs text-neutral-500">
          모든 결과물에는 'AI 생성' 라벨이 표시됩니다 (인공지능기본법 준수).
        </p>
      </section>

      <section className="grid w-full grid-cols-2 gap-3 sm:grid-cols-4">
        {STYLE_FAMILIES.map((f) => (
          <div key={f} className="rounded-xl border p-4 text-sm font-medium">
            {FAMILY_LABELS[f]}
          </div>
        ))}
      </section>
    </div>
  );
}
