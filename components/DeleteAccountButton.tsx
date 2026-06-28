"use client";

import { useState, useTransition } from "react";
import { deleteAccount } from "@/app/account/actions";

export function DeleteAccountButton() {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  return (
    <div data-testid="delete-account">
      {!confirming ? (
        <button
          type="button"
          className="rounded-md border border-red-300 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
          onClick={() => setConfirming(true)}
        >
          회원 탈퇴 및 데이터 삭제
        </button>
      ) : (
        <div className="space-y-2 rounded-lg border border-red-200 bg-red-50 p-3">
          <p className="text-sm text-red-700">
            정말 탈퇴하시겠어요? 업로드한 사진, 생성 이미지, 계정 정보가 모두 영구 삭제되며 복구할 수 없습니다.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={pending}
              className="rounded-md bg-red-600 px-4 py-2 text-sm text-white disabled:opacity-50"
              onClick={() =>
                start(() => {
                  void deleteAccount();
                })
              }
            >
              {pending ? "삭제 중…" : "영구 삭제 확인"}
            </button>
            <button
              type="button"
              className="rounded-md border px-4 py-2 text-sm"
              onClick={() => setConfirming(false)}
            >
              취소
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
