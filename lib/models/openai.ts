import OpenAI from "openai";
import { toFile } from "openai/uploads";
import type { GenInput, GenOutput } from "./types";
import { ModerationBlockedError } from "./types";

const client = new OpenAI();

export async function openaiEdit(input: GenInput): Promise<GenOutput> {
  const { selfies, preset } = input;

  const image = await Promise.all(
    selfies.map((b, i) => toFile(b, `s${i}.png`, { type: "image/png" })),
  );

  const result = await client.images.edit({
    model: preset.model_key,
    image,
    prompt: preset.prompt_template,
    size: preset.size as "1024x1536",
    quality: preset.quality as "high",
    // @ts-expect-error moderation is supported at runtime but not yet in the openai SDK v6 types
    moderation: "auto",
    n: 1,
  });

  const b64 = result.data?.[0]?.b64_json;
  if (!b64) throw new ModerationBlockedError("openai: no image returned");

  const bytes = new Uint8Array(Buffer.from(b64, "base64"));
  const [w, h] = preset.size.split("x").map((n) => Number(n));
  return { bytes, mime: "image/png", width: w || 0, height: h || 0 };
}
