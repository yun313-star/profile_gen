"use client";

import { useEffect, useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import type { GenerationJob } from "@/types/db";

export type JobStreamState = {
  status: GenerationJob["status"];
  assetId: string | null;
  errorCode: string | null;
};

export function useJobStream(
  jobIds: string[],
  initial: Record<string, JobStreamState>,
): Record<string, JobStreamState> {
  const [state, setState] = useState<Record<string, JobStreamState>>(initial);
  const key = JSON.stringify(jobIds);

  useEffect(() => {
    const sb = createBrowserSupabase();
    const channels = jobIds.map((id) =>
      sb
        .channel(`job_${id}`)
        .on("broadcast", { event: "UPDATE" }, (payload: any) => {
          const rec = payload?.payload?.record;
          if (!rec) return;
          setState((s) => ({
            ...s,
            [id]: {
              status: rec.status,
              assetId: rec.asset_id ?? null,
              errorCode: rec.error_code ?? null,
            },
          }));
        })
        .subscribe(),
    );
    return () => {
      channels.forEach((c) => sb.removeChannel(c));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state;
}
