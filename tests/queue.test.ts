// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { queueSend, queueRead, queueDelete } from "@/lib/queue";

describe("lib/queue", () => {
  it("queueSend calls pgmq_send with the message", async () => {
    const rpc = vi.fn(async () => ({ data: 1, error: null }));
    await queueSend({ rpc } as any, { job_id: "j1" });
    expect(rpc).toHaveBeenCalledWith("pgmq_send", { p_msg: { job_id: "j1" } });
  });

  it("queueRead maps rows to {msgId, message}", async () => {
    const rpc = vi.fn(async () => ({
      data: [{ msg_id: 7, message: { job_id: "j1" } }],
      error: null,
    }));
    const rows = await queueRead({ rpc } as any, 5, 60);
    expect(rpc).toHaveBeenCalledWith("pgmq_read", { p_qty: 5, p_vt: 60 });
    expect(rows).toEqual([{ msgId: 7, message: { job_id: "j1" } }]);
  });

  it("queueDelete calls pgmq_delete", async () => {
    const rpc = vi.fn(async () => ({ data: true, error: null }));
    await queueDelete({ rpc } as any, 7);
    expect(rpc).toHaveBeenCalledWith("pgmq_delete", { p_msg_id: 7 });
  });

  it("throws on rpc error", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: new Error("rpc fail") }));
    await expect(queueSend({ rpc } as any, {})).rejects.toThrow("rpc fail");
  });
});
