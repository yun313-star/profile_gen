import Link from "next/link";

export function UploadConsentNotice() {
  return (
    <div
      data-testid="upload-consent-notice"
      className="rounded-lg border border-indigo-100 bg-indigo-50 p-3 text-xs leading-relaxed text-indigo-900"
    >
      <ul className="list-disc space-y-1 pl-4">
        <li>반드시 <strong>본인 얼굴</strong> 사진만 업로드해 주세요. 타인·유명인 등 제3자의 얼굴은 업로드할 수 없습니다.</li>
        <li><strong>만 14세 미만</strong>은 이용할 수 없습니다(만 19세 이상 권장).</li>
        <li>업로드한 원본 사진은 AI 생성 직후 즉시 파기됩니다.</li>
        <li>
          자세한 내용은{" "}
          <Link href="/legal/privacy" className="underline">
            개인정보처리방침
          </Link>
          을 확인해 주세요.
        </li>
      </ul>
    </div>
  );
}
