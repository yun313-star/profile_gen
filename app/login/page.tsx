"use client";

import { createBrowserSupabase } from "@/lib/supabase/browser";

export default function LoginPage() {
  const supabase = createBrowserSupabase();

  async function signIn(provider: "kakao" | "google") {
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/onboarding/consent")}`;
    await supabase.auth.signInWithOAuth({ provider, options: { redirectTo } });
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-6 py-16">
      <h1 className="text-2xl font-bold">로그인 / 회원가입</h1>
      <p className="text-center text-sm text-neutral-600">
        소셜 계정으로 3초 만에 시작하고 무료 크레딧을 받으세요.
      </p>
      <div className="flex w-full flex-col gap-3">
        <button
          type="button"
          onClick={() => signIn("kakao")}
          className="w-full rounded-md bg-[#FEE500] px-4 py-3 font-semibold text-[#191600]"
        >
          카카오로 시작하기
        </button>
        <button
          type="button"
          onClick={() => signIn("google")}
          className="w-full rounded-md border px-4 py-3 font-semibold"
        >
          Google로 시작하기
        </button>
      </div>
      <p className="text-center text-xs text-neutral-500">
        로그인 시 만 14세 이상이며 본인 얼굴만 업로드함에 동의하는 것으로 간주되지 않으며, 다음 단계에서
        별도 동의를 받습니다.
      </p>
    </div>
  );
}
