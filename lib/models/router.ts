import type { GenInput, GenOutput } from "./types";
import { openaiEdit } from "./openai";
import { geminiGenerate } from "./gemini";

export async function generateImage(input: GenInput): Promise<GenOutput> {
  const key = input.preset.model_key;
  if (key.startsWith("google/")) return geminiGenerate(input);
  if (key.startsWith("gpt-image") || key.startsWith("openai/")) return openaiEdit(input);
  throw new Error(`unknown model_key: ${key}`);
}
