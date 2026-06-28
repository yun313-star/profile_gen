"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { BUCKET_OUTPUTS } from "@/lib/storage";
import { AiLabel } from "@/components/AiLabel";
import type { Asset } from "@/types/db";

type Tile = { id: string; url: string; watermarked: boolean };

export default function GalleryPage() {
  const [tiles, setTiles] = useState<Tile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const sb = createBrowserSupabase();
    (async () => {
      const { data } = await sb
        .from("assets")
        .select("id,storage_path,kind,created_at")
        .in("kind", ["output", "watermarked"])
        .order("created_at", { ascending: false });
      const rows = (data ?? []) as Pick<Asset, "id" | "storage_path" | "kind">[];
      const resolved = await Promise.all(
        rows.map(async (a) => {
          const { data: signed } = await sb.storage
            .from(BUCKET_OUTPUTS)
            .createSignedUrl(a.storage_path, 600);
          return signed?.signedUrl
            ? { id: a.id, url: signed.signedUrl, watermarked: a.kind === "watermarked" }
            : null;
        }),
      );
      setTiles(resolved.filter((t): t is Tile => t !== null));
      setLoading(false);
    })();
  }, []);

  if (loading) return <main className="p-6">불러오는 중…</main>;

  return (
    <main className="mx-auto max-w-4xl p-6">
      <h1 className="text-2xl font-bold">내 갤러리</h1>
      {tiles.length === 0 ? (
        <p className="mt-4 text-sm text-gray-500">아직 생성한 이미지가 없습니다.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {tiles.map((t) => (
            <a
              key={t.id}
              href={t.url}
              download={`profai-${t.id}.png`}
              className="relative block overflow-hidden rounded-lg border"
            >
              <img src={t.url} alt="생성 이미지" className="w-full" />
              {/* 인공지능기본법: 모든 생성 결과(유료·무료)에 가시 'AI 생성' 라벨 */}
              <AiLabel className="absolute bottom-1 left-1" />
              {t.watermarked && (
                <span className="absolute right-1 bottom-1 rounded bg-black/60 px-2 py-0.5 text-xs text-white">
                  워터마크
                </span>
              )}
            </a>
          ))}
        </div>
      )}
    </main>
  );
}
