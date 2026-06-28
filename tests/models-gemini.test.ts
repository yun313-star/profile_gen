// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

// gemini.ts creates the Google provider at MODULE LOAD, so the mocks must exist before
// the import runs — use vi.hoisted (referencing non-hoisted consts would TDZ-throw).
const { generateTextMock, modelFactory, createGoogleGenerativeAIMock } = vi.hoisted(() => {
  // Direct Google provider: createGoogleGenerativeAI(opts) returns a model factory; the
  // factory is called with the BARE model id (no "google/" prefix → calls Google directly).
  const modelFactory = vi.fn((id: string) => ({ __googleModel: id }));
  return {
    generateTextMock: vi.fn(),
    modelFactory,
    createGoogleGenerativeAIMock: vi.fn(() => modelFactory),
  };
});
vi.mock("ai", () => ({ generateText: generateTextMock }));
vi.mock("@ai-sdk/google", () => ({ createGoogleGenerativeAI: createGoogleGenerativeAIMock }));

import { geminiGenerate } from "@/lib/models/gemini";
import { ModerationBlockedError } from "@/lib/models/types";

const preset: any = {
  id: "p2",
  model_key: "google/gemini-3-pro-image",
  prompt_template: "cinematic portrait",
  size: "2K",
  quality: "high",
};

beforeEach(() => {
  generateTextMock.mockReset();
  modelFactory.mockClear();
});

describe("geminiGenerate", () => {
  it("uses the direct Google provider with the bare model id, builds parts + imageConfig, reads files", async () => {
    const bytes = new Uint8Array([5, 6, 7]);
    generateTextMock.mockResolvedValue({
      files: [{ mediaType: "image/png", uint8Array: bytes }],
    });

    const out = await geminiGenerate({
      selfies: [new Uint8Array([1]), new Uint8Array([2])],
      preset,
    });

    // "google/" prefix stripped → direct provider model id
    expect(modelFactory).toHaveBeenCalledWith("gemini-3-pro-image");

    const arg = generateTextMock.mock.calls[0][0];
    expect(arg.model).toEqual({ __googleModel: "gemini-3-pro-image" });
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
