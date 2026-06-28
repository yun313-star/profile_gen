"use client";

import { useState } from "react";
import type { CreditPack } from "@/types/db";

export function PackGrid({
  packs,
  isMobile,
  redirect = (url: string) => {
    window.location.href = url;
  },
}: {
  packs: CreditPack[];
  isMobile: boolean;
  redirect?: (url: string) => void;
}) {
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function buy(packId: string) {
    setError(null);
    setLoadingId(packId);
    try {
      const res = await fetch("/api/payments/payapp/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pack_id: packId }),
      });
      const data = (await res.json()) as { payurl?: string; error?: string };
      if (!res.ok || !data.payurl) {
        setError(data.error ?? "결제 생성에 실패했습니다. 잠시 후 다시 시도해 주세요.");
        return;
      }
      if (isMobile) {
        redirect(data.payurl);
      } else {
        const win = window.open(data.payurl, "_blank");
        if (!win) redirect(data.payurl); // popup blocked -> fallback to full redirect
      }
    } catch {
      setError("네트워크 오류가 발생했습니다.");
    } finally {
      setLoadingId(null);
    }
  }

  return (
    <div>
      {error && (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {error}
        </p>
      )}
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {packs.map((pack) => (
          <li key={pack.id} className="rounded-2xl border p-6">
            <h3 className="text-lg font-semibold">{pack.name}</h3>
            <p className="mt-2 text-2xl font-bold">{pack.price.toLocaleString("ko-KR")}원</p>
            <p className="mt-1 text-sm text-gray-500">{pack.credits}크레딧</p>
            <button
              type="button"
              onClick={() => buy(pack.id)}
              disabled={loadingId !== null}
              className="mt-4 w-full rounded-xl bg-black py-3 font-medium text-white disabled:opacity-50"
            >
              {loadingId === pack.id ? "처리 중…" : "구매"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
