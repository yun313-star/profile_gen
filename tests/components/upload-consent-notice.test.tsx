// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { UploadConsentNotice } from "@/components/UploadConsentNotice";

afterEach(() => cleanup());

describe("UploadConsentNotice", () => {
  it("states own-face-only, age gate, and links privacy policy", () => {
    render(<UploadConsentNotice />);
    expect(screen.getByText(/본인 얼굴/)).toBeInTheDocument();
    expect(screen.getByText(/14세/)).toBeInTheDocument();
    expect(screen.getByText(/타인|유명인/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /개인정보처리방침/ })).toHaveAttribute("href", "/legal/privacy");
  });
});
