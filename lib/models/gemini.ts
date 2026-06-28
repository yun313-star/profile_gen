import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { GenInput, GenOutput } from "./types";
import { ModerationBlockedError } from "./types";

// Direct Google Generative AI provider (Nano Banana / Gemini image models). Uses
// GEMINI_API_KEY (Google AI Studio) — falls back to GOOGLE_GENERATIVE_AI_API_KEY, the
// provider's default env name. This calls Google directly; it does NOT route through the
// Vercel AI Gateway (which would need AI_GATEWAY_API_KEY instead).
const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY ?? process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

export async function geminiGenerate(input: GenInput): Promise<GenOutput> {
  const { selfies, preset } = input;
  // model_key carries a "google/" prefix for the router; the direct provider wants the
  // bare model id (e.g. "gemini-3-pro-image").
  const modelId = preset.model_key.replace(/^google\//, "");

  const result = await generateText({
    model: google(modelId),
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
