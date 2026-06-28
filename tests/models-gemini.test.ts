// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const generateTextMock = vi.fn();
vi.mock("ai", () => ({ generateText: (...a: any[]) => generateTextMock(...a) }));

import { geminiGenerate } from "@/lib/models/gemini";
import { ModerationBlockedError } from "@/lib/models/types";

const preset: any = {
  id: "p2",
  model_key: "google/gemini-3-pro-image",
  prompt_template: "cinematic portrait",
  size: "2K",
  quality: "high",
};

beforeEach(() => generateTextMock.mockReset());

describe("geminiGenerate", () => {
  it("builds text+image message parts and imageConfig, reads files", async () => {
    const bytes = new Uint8Array([5, 6, 7]);
    generateTextMock.mockResolvedValue({
      files: [{ mediaType: "image/png", uint8Array: bytes }],
    });

    const out = await geminiGenerate({
      selfies: [new Uint8Array([1]), new Uint8Array([2])],
      preset,
    });

    const arg = generateTextMock.mock.calls[0][0];
    expect(arg.model).toBe("google/gemini-3-pro-image");
    const content = arg.messages[0].content;
    expect(content[0]).toEqual({ type: "text", text: "cinematic portrait" });
    expect(content[1]).toEqual({ type: "image", image: new Uint8Array([1]) });
    expect(content).toHaveLength(3);
    expect(arg.providerOptions.google.imageConfig).toEqual({ aspectRatio: "4:5", imageSize: "2K" });

    expect(out.mime).toBe("image/png");
    expect(Array.from(out.bytes)).toEqual([5, 6, 7]);
  });

  it("throws ModerationBlockedError on empty/blocked output", async () => {
    generateTextMock.mockResolvedValue({ files: [] });
    await expect(geminiGenerate({ selfies: [new Uint8Array([1])], preset })).rejects.toBeInstanceOf(
      ModerationBlockedError,
    );
  });
});
