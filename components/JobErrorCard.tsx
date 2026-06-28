"use client";

import Link from "next/link";
import { describeJobError } from "@/lib/jobErrors";

export function JobErrorCard({ errorCode }: { errorCode: string | null }) {
  const v = describeJobError(errorCode);
  return (
    <div
      data-testid="job-error-card"
      role="alert"
      className="flex flex-col items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-900"
    >
      <p className="font-semibold">{v.title}</p>
      <p className="text-rose-800">{v.message}</p>
      {v.canRetry && (
        <Link
          href="/create"
          className="rounded-md bg-rose-600 px-4 py-2 text-sm font-medium text-white hover:bg-rose-700"
        >
          다시 만들기
        </Link>
      )}
    </div>
  );
}
