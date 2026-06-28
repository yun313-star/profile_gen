"use client";

import { useEffect, useState } from "react";

type Status = "PENDING" | "PAID" | "REFUNDED";

export function OrderStatus({
  orderId,
  initialStatus,
  pollMs = 3000,
}: {
  orderId: string;
  initialStatus: Status;
  pollMs?: number;
}) {
  const [status, setStatus] = useState<Status>(initialStatus);

  useEffect(() => {
    if (status !== "PENDING") return;
    let active = true;
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/credits/result/status?order=${encodeURIComponent(orderId)}`);
        if (!res.ok) return;
        const data = (await res.json()) as { status?: Status };
        if (active && data.status && data.status !== "PENDING") {
          setStatus(data.status);
          clearInterval(timer);
        }
      } catch {
        // transient; keep polling
      }
    }, pollMs);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [status, orderId, pollMs]);

  if (status === "PAID") {
    return (
      <div role="status" className="rounded-xl bg-green-50 p-6 text-green-800">
        <p className="font-semibold">충전이 완료되었습니다.</p>
        <p className="mt-1 text-sm">크레딧이 적립되었어요. 이제 프로필을 만들어 보세요.</p>
      </div>
    );
  }
  if (status === "REFUNDED") {
    return (
      <div role="status" className="rounded-xl bg-gray-50 p-6 text-gray-700">
        <p className="font-semibold">환불 처리된 주문입니다.</p>
      </div>
    );
  }
  return (
    <div role="status" className="rounded-xl bg-yellow-50 p-6 text-yellow-800">
      <p className="font-semibold">결제 확인 중…</p>
      <p className="mt-1 text-sm">결제가 완료되면 자동으로 크레딧이 적립됩니다. 잠시만 기다려 주세요.</p>
    </div>
  );
}
