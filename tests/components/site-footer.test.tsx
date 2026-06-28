// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { SiteFooter } from "@/components/SiteFooter";

afterEach(() => cleanup());

it("shows business identity + legal links + refund summary", () => {
  render(<SiteFooter />);
  expect(screen.getByText(/사업자등록번호/)).toBeInTheDocument();
  expect(screen.getByText(/통신판매업신고/)).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "이용약관" })).toHaveAttribute("href", "/legal/terms");
  expect(screen.getByRole("link", { name: "개인정보처리방침" })).toHaveAttribute("href", "/legal/privacy");
  expect(screen.getByText(/미사용 크레딧/)).toBeInTheDocument();
});
