import type { GenInput, GenOutput } from "./types";
import { openaiEdit } from "./openai";
import { geminiGenerate } from "./gemini";

export async function generateImage(input: GenInput): Promise<GenOutput> {
  // E2E stub: never hit a paid provider when explicitly enabled. Production is
  // unaffected when E2E_STUB_MODEL is unset (the unit tests in Task 2.10 run
  // without the flag).
  if (process.env.E2E_STUB_MODEL === "1") {
    const onePixelPng = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      "base64",
    );
    return { bytes: new Uint8Array(onePixelPng), mime: "image/png", width: 1, height: 1 };
  }

  const key = input.preset.model_key;
  if (key.startsWith("google/")) return geminiGenerate(input);
  if (key.startsWith("gpt-image") || key.startsWith("openai/")) return openaiEdit(input);
  throw new Error(`unknown model_key: ${key}`);
}
