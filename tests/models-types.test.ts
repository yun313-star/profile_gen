// @vitest-environment node
import { it, expect } from "vitest";
import { ModerationBlockedError } from "@/lib/models/types";

it("ModerationBlockedError is an Error with the right name", () => {
  const e = new ModerationBlockedError("blocked");
  expect(e).toBeInstanceOf(Error);
  expect(e).toBeInstanceOf(ModerationBlockedError);
  expect(e.name).toBe("ModerationBlockedError");
  expect(e.message).toBe("blocked");
});

it("ModerationBlockedError has a default message", () => {
  expect(new ModerationBlockedError().message).toBe("moderation blocked");
});
