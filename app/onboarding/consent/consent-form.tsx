"use client";

import { useState } from "react";
import { submitConsent } from "./actions";
import {
  REQUIRED_CONSENTS,
  OPTIONAL_CONSENTS,
  CONSENT_LABELS,
} from "@/lib/consent";
import { MIN_AGE } from "@/lib/age";

type ErrorKind = "required" | "age" | "birthdate" | null;

export function ConsentForm({ error }: { error: ErrorKind }) {
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [birthdate, setBirthdate] = useState("");
  const allRequiredChecked = REQUIRED_CONSENTS.every((t) => checked[t]);
  const canSubmit = allRequiredChecked && birthdate !== "";

  function toggleAll(on: boolean) {
    const next: Record<string, boolean> = {};
    for (const t of [...REQUIRED_CONSENTS, ...OPTIONAL_CONSENTS]) next[t] = on;
    setChecked(next);
  }

  return (
    <form action={submitConsent} className="flex flex-col gap-4">
      {error === "required" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          필수 동의 항목에 모두 체크해야 진행할 수 있습니다.
        </p>
      )}
      {error === "age" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          만 {MIN_AGE}세 미만은 서비스를 이용할 수 없습니다.
        </p>
      )}
      {error === "birthdate" && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
          생년월일을 입력해 주세요.
        </p>
      )}

      <label className="flex flex-col gap-1 border-b pb-3 text-sm">
        <span className="font-semibold">생년월일 (만 {MIN_AGE}세 이상만 이용 가능)</span>
        <input
          type="date"
          name="birthdate"
          required
          value={birthdate}
          max="2099-12-31"
          onChange={(e) => setBirthdate(e.target.value)}
          className="rounded-md border px-3 py-2"
        />
      </label>

      <label className="flex items-center gap-2 border-b pb-3 text-sm font-semibold">
        <input
          type="checkbox"
          checked={[...REQUIRED_CONSENTS, ...OPTIONAL_CONSENTS].every((t) => checked[t])}
          onChange={(e) => toggleAll(e.target.checked)}
        />
        전체 동의
      </label>

      {[...REQUIRED_CONSENTS, ...OPTIONAL_CONSENTS].map((t) => (
        <label key={t} className="flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            name={t}
            checked={!!checked[t]}
            onChange={(e) => setChecked((c) => ({ ...c, [t]: e.target.checked }))}
          />
          <span>{CONSENT_LABELS[t].title}</span>
        </label>
      ))}

      <button
        type="submit"
        disabled={!canSubmit}
        className="mt-2 rounded-lg bg-neutral-900 px-6 py-3 font-semibold text-white disabled:opacity-40"
      >
        동의하고 시작하기
      </button>
    </form>
  );
}
