"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { validateSelfieFile, resizeSelfie, MAX_SELFIE_COUNT } from "@/lib/image-client";
import { STYLE_FAMILIES } from "@/lib/styles";
import type { StylePreset } from "@/types/db";

const FAMILY_LABEL: Record<string, string> = {
  business: "비즈·증명사진",
  editorial: "컨셉 화보",
  sns: "SNS 감성",
  fantasy: "판타지·아트",
};

export function Studio() {
  const router = useRouter();
  const [presets, setPresets] = useState<StylePreset[]>([]);
  const [styleId, setStyleId] = useState<string>("");
  const [count, setCount] = useState<number>(1);
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = createBrowserSupabase();
    sb.from("style_presets")
      .select("*")
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .then(({ data }) => {
        const rows = (data ?? []) as StylePreset[];
        setPresets(rows);
        if (rows[0]) setStyleId(rows[0].id);
      });
  }, []);

  async function onFiles(list: FileList | null) {
    setError(null);
    if (!list) return;
    const picked = Array.from(list).slice(0, MAX_SELFIE_COUNT);
    for (const f of picked) {
      const v = validateSelfieFile({ type: f.type, size: f.size });
      if (!v.ok) {
        setError(v.reason);
        return;
      }
    }
    const resized = await Promise.all(
      picked.map(async (f) => new File([await resizeSelfie(f)], f.name.replace(/\.\w+$/, ".png"), { type: "image/png" })),
    );
    setFiles(resized);
  }

  async function onSubmit() {
    setError(null);
    if (files.length < 1) return setError("셀카를 1장 이상 업로드해 주세요.");
    if (!styleId) return setError("스타일을 선택해 주세요.");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("styleId", styleId);
      fd.set("count", String(count));
      files.forEach((f) => fd.append("selfies", f));
      const res = await fetch("/api/generate", { method: "POST", body: fd });
      if (res.status === 402) {
        setError("크레딧이 부족합니다. 크레딧을 충전해 주세요.");
        return;
      }
      if (res.status === 403) {
        setError("생성을 위해 약관·개인정보·본인얼굴 동의가 필요합니다.");
        return;
      }
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        setError(b.error ?? "생성 요청에 실패했습니다.");
        return;
      }
      const { batchId } = await res.json();
      router.push(`/result/${batchId}`);
    } finally {
      setBusy(false);
    }
  }

  const byFamily = (fam: string) => presets.filter((p) => p.family === fam);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-2xl font-bold">AI 프로필 만들기</h1>

      <section className="mt-6">
        <label className="block text-sm font-medium">셀카 업로드 (최대 {MAX_SELFIE_COUNT}장)</label>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => onFiles(e.target.files)}
          className="mt-2"
        />
        {files.length > 0 && <p className="mt-1 text-sm text-gray-500">{files.length}장 선택됨</p>}
      </section>

      <section className="mt-6">
        <p className="text-sm font-medium">스타일</p>
        {STYLE_FAMILIES.map((fam) => (
          <div key={fam} className="mt-3">
            <p className="text-xs text-gray-500">{FAMILY_LABEL[fam] ?? fam}</p>
            <div className="mt-1 flex flex-wrap gap-2">
              {byFamily(fam).map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setStyleId(p.id)}
                  className={`rounded-full border px-3 py-1 text-sm ${
                    styleId === p.id ? "border-black bg-black text-white" : "border-gray-300"
                  }`}
                >
                  {p.name_ko}
                </button>
              ))}
            </div>
          </div>
        ))}
      </section>

      <section className="mt-6">
        <label className="block text-sm font-medium">변형 수</label>
        <select
          value={count}
          onChange={(e) => setCount(Number(e.target.value))}
          className="mt-2 rounded border px-2 py-1"
        >
          {[1, 2, 3, 4].map((n) => (
            <option key={n} value={n}>
              {n}장
            </option>
          ))}
        </select>
      </section>

      {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

      <button
        type="button"
        onClick={onSubmit}
        disabled={busy}
        className="mt-6 rounded-lg bg-black px-5 py-2 text-white disabled:opacity-50"
      >
        {busy ? "생성 요청 중…" : "생성하기"}
      </button>
    </main>
  );
}
