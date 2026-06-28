import { describe, it, expect } from "vitest";
import { metadata } from "@/app/layout";

describe("root metadata (SEO + PWA link)", () => {
  it("has title, description, and links the manifest", () => {
    // metadata.title may be a string or a TemplateString object { default, template }
    const titleStr =
      typeof metadata.title === "string"
        ? metadata.title
        : JSON.stringify(metadata.title);
    expect(titleStr).toContain("ProfAI");
    expect(metadata.description).toBeTruthy();
    expect(metadata.manifest).toBe("/manifest.webmanifest");
  });
});
