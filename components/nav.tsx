import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

export async function Nav() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let balance: number | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("credit_balance")
      .eq("id", user.id)
      .maybeSingle();
    balance = (data?.credit_balance as number | undefined) ?? 0;
  }

  return (
    <header className="flex items-center justify-between border-b px-4 py-3">
      <Link href="/" className="text-lg font-bold tracking-tight">
        ProfAI
      </Link>
      <nav className="flex items-center gap-4 text-sm">
        {user ? (
          <>
            <span
              className="rounded-full bg-neutral-100 px-3 py-1 font-medium"
              aria-label="보유 크레딧"
            >
              크레딧 {balance ?? 0}
            </span>
            <Link href="/create" className="hover:underline">
              만들기
            </Link>
            <Link href="/gallery" className="hover:underline">
              갤러리
            </Link>
            <Link href="/credits" className="hover:underline">
              크레딧 충전
            </Link>
            <Link href="/account" className="hover:underline">
              내 계정
            </Link>
          </>
        ) : (
          <Link
            href="/login"
            className="rounded-md bg-neutral-900 px-3 py-1.5 text-white"
          >
            로그인
          </Link>
        )}
      </nav>
    </header>
  );
}
