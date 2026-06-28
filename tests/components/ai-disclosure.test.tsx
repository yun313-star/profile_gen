// @vitest-environment jsdom
import { it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { AiLabel } from "@/components/AiLabel";
import { AiDisclosureBanner } from "@/components/AiDisclosureBanner";
import "@testing-library/jest-dom";

afterEach(() => cleanup());

it("renders a visible 'AI 생성' label chip", () => {
  render(<AiLabel />);
  expect(screen.getByTestId("ai-label")).toHaveTextContent("AI 생성");
});

it("renders the site-wide AI disclosure banner", () => {
  render(<AiDisclosureBanner />);
  const banner = screen.getByTestId("ai-disclosure-banner");
  expect(banner).toHaveTextContent("AI로 이미지를 생성");
});
