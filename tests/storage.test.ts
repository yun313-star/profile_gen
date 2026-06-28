// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { uploadObject, createSignedUrl, downloadBytes, removeObjects, BUCKET_SELFIES, BUCKET_OUTPUTS } from "@/lib/storage";

function makeSb(over: Record<string, any> = {}) {
  const api = {
    upload: vi.fn(async () => ({ data: { path: "p" }, error: null })),
    createSignedUrl: vi.fn(async () => ({ data: { signedUrl: "https://signed/x" }, error: null })),
    download: vi.fn(async () => ({ data: new Blob([new Uint8Array([1, 2, 3])]), error: null })),
    remove: vi.fn(async () => ({ data: [], error: null })),
    ...over,
  };
  return { sb: { storage: { from: vi.fn(() => api) } } as any, api };
}

describe("lib/storage", () => {
  it("exposes bucket constants", () => {
    expect(BUCKET_SELFIES).toBe("selfies");
    expect(BUCKET_OUTPUTS).toBe("outputs");
  });

  it("uploadObject passes contentType and upsert", async () => {
    const { sb, api } = makeSb();
    await uploadObject(sb, BUCKET_OUTPUTS, "u/1.png", new Uint8Array([9]), "image/png");
    expect(sb.storage.from).toHaveBeenCalledWith("outputs");
    expect(api.upload).toHaveBeenCalledWith("u/1.png", expect.any(Uint8Array), {
      contentType: "image/png",
      upsert: true,
    });
  });

  it("uploadObject throws on error", async () => {
    const { sb } = makeSb({ upload: vi.fn(async () => ({ data: null, error: new Error("boom") })) });
    await expect(uploadObject(sb, BUCKET_SELFIES, "p", new Uint8Array(), "image/png")).rejects.toThrow("boom");
  });

  it("createSignedUrl returns the url with default 300s expiry", async () => {
    const { sb, api } = makeSb();
    const url = await createSignedUrl(sb, BUCKET_SELFIES, "u/b/0.png");
    expect(url).toBe("https://signed/x");
    expect(api.createSignedUrl).toHaveBeenCalledWith("u/b/0.png", 300);
  });

  it("downloadBytes returns a Uint8Array", async () => {
    const { sb } = makeSb();
    const bytes = await downloadBytes(sb, BUCKET_SELFIES, "p");
    expect(Array.from(bytes)).toEqual([1, 2, 3]);
  });

  it("removeObjects passes the path list to storage.remove", async () => {
    const { sb, api } = makeSb();
    await removeObjects(sb, BUCKET_SELFIES, ["u/b/0.png", "u/b/1.png"]);
    expect(sb.storage.from).toHaveBeenCalledWith("selfies");
    expect(api.remove).toHaveBeenCalledWith(["u/b/0.png", "u/b/1.png"]);
  });

  it("removeObjects is a no-op for an empty list", async () => {
    const { sb, api } = makeSb();
    await removeObjects(sb, BUCKET_SELFIES, []);
    expect(api.remove).not.toHaveBeenCalled();
  });
});
