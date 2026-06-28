import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase/server";
import type { Consent } from "@/types/db";
import { MarketingToggle } from "@/components/MarketingToggle";
import { DeleteAccountButton } from "@/components/DeleteAccountButton";

export const runtime = "nodejs";
export const metadata: Metadata = { title: "계정" };

const CONSENT_LABEL: Record<Consent["type"], string> = {
  tos: "이용약관",
  privacy: "개인정보 수집·이용",
  sensitive_face: "민감정보(얼굴) 별도 동의",
  own_face: "본인 얼굴만 업로드 확인",
  marketing: "마케팅 정보 수신(선택)",
};

export default async function AccountPage() {
  const sb = await createServerSupabase();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: consentRows } = await sb
    .from("consents")
    .select("*")
    .eq("user_id", user.id)
    .order("agreed_at", { ascending: false });
  const consents = (consentRows ?? []) as Consent[];

  const latestMarketing = consents.find((c) => c.type === "marketing");
  const marketingOptedIn = !!latestMarketing && !latestMarketing.version.endsWith("withdrawn");

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="mb-8 text-2xl font-bold">계정 설정</h1>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">동의 이력</h2>
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-300 text-gray-500">
              <th className="py-2 pr-3">항목</th>
              <th className="py-2 pr-3">버전</th>
              <th className="py-2">동의 일시</th>
            </tr>
          </thead>
          <tbody>
            {consents.length === 0 ? (
              <tr>
                <td className="py-3 text-gray-400" colSpan={3}>
                  동의 이력이 없습니다.
                </td>
              </tr>
            ) : (
              consents.map((c) => (
                <tr key={c.id} className="border-b border-gray-100">
                  <td className="py-2 pr-3">{CONSENT_LABEL[c.type] ?? c.type}</td>
                  <td className="py-2 pr-3">{c.version}</td>
                  <td className="py-2">{new Date(c.agreed_at).toLocaleString("ko-KR")}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="mb-10">
        <h2 className="mb-3 text-lg font-semibold">마케팅 수신 설정</h2>
        <MarketingToggle initial={marketingOptedIn} />
      </section>

      <section>
        <h2 className="mb-3 text-lg font-semibold">회원 탈퇴 및 데이터 삭제</h2>
        <p className="mb-3 text-sm text-gray-500">
          탈퇴 시 업로드한 사진, 생성한 이미지, 계정 정보가 모두 영구 삭제됩니다. 법령상 보존이 필요한 결제 기록은
          관련 법령이 정한 기간 동안 분리 보관될 수 있습니다.
        </p>
        <DeleteAccountButton />
      </section>
    </main>
  );
}
