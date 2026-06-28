// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";

let broadcastHandler: ((p: any) => void) | null = null;
const channelObj = {
  on: vi.fn((_type: string, _filter: any, cb: (p: any) => void) => {
    broadcastHandler = cb;
    return channelObj;
  }),
  subscribe: vi.fn(() => channelObj),
};
const removeChannel = vi.fn();
vi.mock("@/lib/supabase/browser", () => ({
  createBrowserSupabase: () => ({ channel: vi.fn(() => channelObj), removeChannel }),
}));

import { useJobStream, type JobStreamState } from "@/lib/useJobStream";

function Probe({ ids, initial }: { ids: string[]; initial: Record<string, JobStreamState> }) {
  const state = useJobStream(ids, initial);
  return <div data-testid="out">{JSON.stringify(state)}</div>;
}

beforeEach(() => {
  broadcastHandler = null;
  vi.clearAllMocks();
});

describe("useJobStream", () => {
  it("subscribes and applies broadcast updates", () => {
    const initial = { j1: { status: "queued", assetId: null, errorCode: null } as JobStreamState };
    const { getByTestId } = render(<Probe ids={["j1"]} initial={initial} />);
    expect(channelObj.subscribe).toHaveBeenCalled();

    act(() => {
      broadcastHandler?.({ payload: { record: { status: "done", asset_id: "a1", error_code: null } } });
    });

    const state = JSON.parse(getByTestId("out").textContent!);
    expect(state.j1.status).toBe("done");
    expect(state.j1.assetId).toBe("a1");
  });
});
