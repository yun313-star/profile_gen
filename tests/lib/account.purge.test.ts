import { describe, it, expect, vi } from "vitest";
import { purgeExpiredSelfies } from "@/lib/account";

function makeSb(rows: { id: string; storage_path: string }[]) {
  const removeSpy = vi.fn().mockResolvedValue({ error: null });
  const deleteSpy = vi.fn();
  const from = () => {
    const o: any = { _op: "select" };
    o.select = () => o;
    o.eq = () => o;
    o.not = () => o;
    o.lte = () => o;
    o.in = (_col: string, ids: string[]) => {
      deleteSpy(ids);
      return o;
    };
    o.delete = () => {
      o._op = "delete";
      return o;
    };
    o.then = (resolve: (v: any) => void) =>
      resolve(o._op === "delete" ? { error: null } : { data: rows, error: null });
    return o;
  };
  return {
    sb: { from, storage: { from: () => ({ remove: removeSpy }) } } as any,
    removeSpy,
    deleteSpy,
  };
}

describe("purgeExpiredSelfies", () => {
  it("removes expired selfie objects + rows and returns the count", async () => {
    const { sb, removeSpy, deleteSpy } = makeSb([
      { id: "a1", storage_path: "sel/u1/x.png" },
      { id: "a2", storage_path: "sel/u2/y.png" },
    ]);
    const res = await purgeExpiredSelfies(sb, new Date("2026-06-27T00:00:00Z"));
    expect(res.purged).toBe(2);
    expect(removeSpy).toHaveBeenCalledWith(["sel/u1/x.png", "sel/u2/y.png"]);
    expect(deleteSpy).toHaveBeenCalledWith(["a1", "a2"]);
  });

  it("is a no-op when nothing is expired", async () => {
    const { sb, removeSpy } = makeSb([]);
    const res = await purgeExpiredSelfies(sb);
    expect(res.purged).toBe(0);
    expect(removeSpy).not.toHaveBeenCalled();
  });
});
