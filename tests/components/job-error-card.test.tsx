// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { JobErrorCard } from "@/components/JobErrorCard";

afterEach(() => cleanup());

describe("JobErrorCard", () => {
  it("renders friendly copy, refund note, and a retry link to /create", () => {
    render(<JobErrorCard errorCode="moderation_blocked" />);
    expect(screen.getByText(/생성이 제한/)).toBeInTheDocument();
    expect(screen.getByText(/환불/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /다시 만들기/ })).toHaveAttribute("href", "/create");
  });

  it("falls back for an unknown/null code and still shows the refund note + retry", () => {
    render(<JobErrorCard errorCode={null} />);
    expect(screen.getByText(/환불/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /다시 만들기/ })).toHaveAttribute("href", "/create");
  });
});
