"use client";

import { useState, useTransition } from "react";
import { setMarketingConsent } from "@/app/account/actions";

export function MarketingToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [pending, start] = useTransition();
  return (
    <label className="flex items-center gap-3" data-testid="marketing-toggle">
      <input
        type="checkbox"
        checked={on}
        disabled={pending}
        onChange={(e) => {
          const next = e.target.checked;
          setOn(next);
          start(() => {
            void setMarketingConsent(next);
          });
        }}
      />
      <span className="text-sm">마케팅 정보 수신 동의 (선택){pending ? " · 저장 중…" : ""}</span>
    </label>
  );
}
