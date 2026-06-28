import { describe, it, expect, vi } from "vitest";
import { deleteUserData } from "@/lib/account";
import { BUCKET_SELFIES, BUCKET_OUTPUTS } from "@/lib/storage";

function makeSb(opts: {
  assets?: { storage_path: string; kind: string }[];
  deleteUserSpy?: ReturnType<typeof vi.fn>;
  deleteTables?: string[];
}) {
  const deleteUserSpy = opts.deleteUserSpy ?? vi.fn().mockResolvedValue({ error: null });
  const deleteTables = opts.deleteTables ?? [];
  const assets = opts.assets ?? [];
  // record which bucket each remove() call targeted
  const removeByBucket: Record<string, string[][]> = {};
  const storage = {
    from: (bucket: string) => ({
      remove: (paths: string[]) => {
        (removeByBucket[bucket] ??= []).push(paths);
        return Promise.resolve({ error: null });
      },
    }),
  };
  const from = (table: string) => {
    const o: any = { _op: "select" };
    o.select = () => o;
    o.eq = () => o;
    o.in = () => o;
    o.not = () => o;
    o.lte = () => o;
    o.delete = () => {
      o._op = "delete";
      deleteTables.push(table);
      return o;
    };
    o.then = (resolve: (v: any) => void) =>
      resolve(o._op === "delete" ? { error: null } : { data: assets, error: null });
    return o;
  };
  return {
    sb: {
      from,
      storage,
      auth: { admin: { deleteUser: deleteUserSpy } },
    } as any,
    removeByBucket,
    deleteUserSpy,
    deleteTables,
  };
}

describe("deleteUserData", () => {
  it("removes objects from BOTH buckets by kind, deletes rows, then deletes the auth user", async () => {
    const deleteTables: string[] = [];
    const { sb, removeByBucket, deleteUserSpy } = makeSb({
      assets: [
        { storage_path: "u1/b/a.png", kind: "source_selfie" },
        { storage_path: "u1/b/0.png", kind: "output" },
      ],
      deleteTables,
    });
    await deleteUserData(sb, "u1");
    expect(removeByBucket[BUCKET_SELFIES]).toEqual([["u1/b/a.png"]]);
    expect(removeByBucket[BUCKET_OUTPUTS]).toEqual([["u1/b/0.png"]]);
    expect(deleteTables).toEqual([
      "assets",
      "generation_jobs",
      "credit_ledger",
      "orders",
      "consents",
      "profiles",
    ]);
    expect(deleteUserSpy).toHaveBeenCalledWith("u1");
  });

  it("skips storage.remove for a bucket with no matching assets", async () => {
    const { sb, removeByBucket, deleteUserSpy } = makeSb({ assets: [] });
    await deleteUserData(sb, "u2");
    expect(removeByBucket[BUCKET_SELFIES]).toBeUndefined();
    expect(removeByBucket[BUCKET_OUTPUTS]).toBeUndefined();
    expect(deleteUserSpy).toHaveBeenCalledWith("u2");
  });

  it("throws if auth user deletion fails (so the caller can surface it)", async () => {
    const deleteUserSpy = vi.fn().mockResolvedValue({ error: { message: "boom" } });
    const { sb } = makeSb({ assets: [], deleteUserSpy });
    await expect(deleteUserData(sb, "u3")).rejects.toBeTruthy();
  });
});
