import { generateText } from "ai";
import type { GenInput, GenOutput } from "./types";
import { ModerationBlockedError } from "./types";

export async function geminiGenerate(input: GenInput): Promise<GenOutput> {
  const { selfies, preset } = input;

  const result = await generateText({
    // preset.model_key is a plain string; LanguageModel accepts GatewayModelId which
    // includes (string & {}) so this is type-safe at runtime via the AI Gateway router.
    model: preset.model_key as `google/${string}`,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: preset.prompt_template },
          ...selfies.map((b) => ({ type: "image" as const, image: b })),
        ],
      },
    ],
    providerOptions: {
      google: { imageConfig: { aspectRatio: "4:5", imageSize: preset.size } },
    },
  });

  const file = result.files.find((f) => f.mediaType.startsWith("image/"));
  if (!file) throw new ModerationBlockedError("gemini: blocked or empty response");

  // Gemini does not return pixel dims; the worker recomputes via sharp.metadata().
  return { bytes: new Uint8Array(file.uint8Array), mime: file.mediaType, width: 0, height: 0 };
}
