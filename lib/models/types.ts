import type { StylePreset } from "@/types/db";

export type GenInput = { selfies: Uint8Array[]; preset: StylePreset };

export type GenOutput = { bytes: Uint8Array; mime: string; width: number; height: number };

export class ModerationBlockedError extends Error {
  constructor(message = "moderation blocked") {
    super(message);
    this.name = "ModerationBlockedError";
  }
}
