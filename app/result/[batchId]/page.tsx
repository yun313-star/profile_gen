"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { useJobStream, type JobStreamState } from "@/lib/useJobStream";
import { BUCKET_OUTPUTS } from "@/lib/storage";
import { JobErrorCard } from "@/components/JobErrorCard";
import type { GenerationJob } from "@/types/db";

const STATUS_LABEL: Record<string, string> = {
  queued: "대기 중",
  processing: "생성 중…",
  done: "완료",
  failed: "실패",
};

export default function ResultPage() {
  const params = useParams<{ batchId: string }>();
  const batchId = params.batchId;
  const [jobIds, setJobIds] = useState<string[]>([]);
  const [initial, setInitial] = useState<Record<string, JobStreamState>>({});
  const [ready, setReady] = useState(false);
  const [urls, setUrls] = useState<Record<string, string>>({});

  useEffect(() => {
    const sb = createBrowserSupabase();
    sb.from("generation_jobs")
      .select("id,status,asset_id,error_code")
      .eq("batch_id", batchId)
      .then(({ data }) => {
        const jobs = (data ?? []) as Pick<GenerationJob, "id" | "status" | "asset_id" | "error_code">[];
        setJobIds(jobs.map((j) => j.id));
        setInitial(
          Object.fromEntries(
            jobs.map((j) => [j.id, { status: j.status, assetId: j.asset_id, errorCode: j.error_code }]),
          ),
        );
        setReady(true);
      });
  }, [batchId]);

  const stream = useJobStream(jobIds, initial);

  // resolve signed URLs for finished jobs
  useEffect(() => {
    const sb = createBrowserSupabase();
    for (const [id, s] of Object.entries(stream)) {
      if (s.status === "done" && s.assetId && !urls[id]) {
        sb.from("assets")
          .select("storage_path")
          .eq("id", s.assetId)
          .single()
          .then(async ({ data }) => {
            if (!data) return;
            const { data: signed } = await sb.storage
              .from(BUCKET_OUTPUTS)
              .createSignedUrl(data.storage_path, 600);
            if (signed?.signedUrl) setUrls((u) => ({ ...u, [id]: signed.signedUrl }));
          });
      }
    }
  }, [stream, urls]);

  if (!ready) return <main className="p-6">불러오는 중…</main>;

  const entries = Object.entries(stream);
  const done = entries.filter(([, s]) => s.status === "done").length;

  return (
    <main className="mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-bold">생성 결과</h1>
      <p className="mt-1 text-sm text-gray-500">
        {done}/{entries.length} 완료
      </p>

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {entries.map(([id, s]) => (
          <div key={id} className="rounded-lg border p-2">
            {s.status === "failed" ? (
              <JobErrorCard errorCode={s.errorCode} />
            ) : s.status === "done" && urls[id] ? (
              <a href={urls[id]} download={`profai-${id}.png`}>
                <img src={urls[id]} alt="결과" className="w-full rounded" />
              </a>
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center text-sm text-gray-500">
                {STATUS_LABEL[s.status] ?? s.status}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
