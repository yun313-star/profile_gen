// @vitest-environment node
import { it, expect, vi, beforeEach } from "vitest";

const openaiMock = vi.fn();
const geminiMock = vi.fn();
vi.mock("@/lib/models/openai", () => ({ openaiEdit: (...a: any[]) => openaiMock(...a) }));
vi.mock("@/lib/models/gemini", () => ({ geminiGenerate: (...a: any[]) => geminiMock(...a) }));

import { generateImage } from "@/lib/models/router";

const out = { bytes: new Uint8Array([1]), mime: "image/png", width: 1, height: 1 };

beforeEach(() => {
  openaiMock.mockReset().mockResolvedValue(out);
  geminiMock.mockReset().mockResolvedValue(out);
});

it("routes gpt-image-* to openaiEdit", async () => {
  await generateImage({ selfies: [], preset: { model_key: "gpt-image-2" } as any });
  expect(openaiMock).toHaveBeenCalledTimes(1);
  expect(geminiMock).not.toHaveBeenCalled();
});

it("routes gpt-image-1-mini to openaiEdit", async () => {
  await generateImage({ selfies: [], preset: { model_key: "gpt-image-1-mini" } as any });
  expect(openaiMock).toHaveBeenCalledTimes(1);
});

it("routes openai/* to openaiEdit", async () => {
  await generateImage({ selfies: [], preset: { model_key: "openai/gpt-image-2" } as any });
  expect(openaiMock).toHaveBeenCalledTimes(1);
  expect(geminiMock).not.toHaveBeenCalled();
});

it("routes google/* (gemini-3-pro-image) to geminiGenerate", async () => {
  await generateImage({ selfies: [], preset: { model_key: "google/gemini-3-pro-image" } as any });
  expect(geminiMock).toHaveBeenCalledTimes(1);
  expect(openaiMock).not.toHaveBeenCalled();
});

it("throws on unknown model_key", async () => {
  await expect(
    generateImage({ selfies: [], preset: { model_key: "mystery" } as any }),
  ).rejects.toThrow(/unknown model_key/);
});
