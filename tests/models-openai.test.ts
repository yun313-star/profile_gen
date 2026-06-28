// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const editMock = vi.hoisted(() => vi.fn());
vi.mock("openai", () => ({
  default: class {
    images = { edit: editMock };
  },
}));
vi.mock("openai/uploads", () => ({
  toFile: vi.fn(async (b: Uint8Array, name: string, opts: { type: string }) => ({
    name,
    type: opts.type,
    _bytes: b,
  })),
}));

import { openaiEdit } from "@/lib/models/openai";
import { ModerationBlockedError } from "@/lib/models/types";

const preset: any = {
  id: "p1",
  model_key: "gpt-image-2",
  prompt_template: "studio headshot",
  size: "1024x1536",
  quality: "high",
};

beforeEach(() => editMock.mockReset());

describe("openaiEdit", () => {
  it("sends image[], size, quality, moderation:auto, n:1 and decodes b64", async () => {
    const png = Buffer.from("PNGDATA").toString("base64");
    editMock.mockResolvedValue({ data: [{ b64_json: png }] });

    const out = await openaiEdit({
      selfies: [new Uint8Array([1]), new Uint8Array([2])],
      preset,
    });

    expect(editMock).toHaveBeenCalledTimes(1);
    const arg = editMock.mock.calls[0][0];
    expect(arg.model).toBe("gpt-image-2");
    expect(arg.prompt).toBe("studio headshot");
    expect(arg.size).toBe("1024x1536");
    expect(arg.quality).toBe("high");
    expect(arg.moderation).toBe("auto");
    expect(arg.n).toBe(1);
    expect(Array.isArray(arg.image)).toBe(true);
    expect(arg.image).toHaveLength(2);

    expect(out.mime).toBe("image/png");
    expect(out.width).toBe(1024);
    expect(out.height).toBe(1536);
    expect(Buffer.from(out.bytes).toString()).toBe("PNGDATA");
  });

  it("throws ModerationBlockedError when no image returned", async () => {
    editMock.mockResolvedValue({ data: [{}] });
    await expect(openaiEdit({ selfies: [new Uint8Array([1])], preset })).rejects.toBeInstanceOf(
      ModerationBlockedError,
    );
  });
});
