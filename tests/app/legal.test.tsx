// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import TermsPage from "@/app/legal/terms/page";
import PrivacyPage from "@/app/legal/privacy/page";

afterEach(() => cleanup());

describe("legal pages", () => {
  it("terms page mentions refund / 청약철회", () => {
    render(<TermsPage />);
    expect(screen.getByRole("heading", { name: /이용약관/ })).toBeInTheDocument();
    expect(screen.getAllByText(/청약철회/).length).toBeGreaterThan(0);
  });

  it("privacy page discloses overseas processors, retention, and sensitive-data basis", () => {
    render(<PrivacyPage />);
    expect(screen.getAllByText(/국외/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/OpenAI/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Google/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/PayApp/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/민감정보/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/파기/).length).toBeGreaterThan(0);
  });
});
