// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

const order = (asc: boolean) =>
  Promise.resolve({
    data: [
      {
        id: 1,
        user_id: "u1",
        type: "sensitive_face",
        version: "1.0",
        agreed_at: "2026-06-20T00:00:00Z",
        ip: null,
      },
      {
        id: 2,
        user_id: "u1",
        type: "marketing",
        version: "1.0",
        agreed_at: "2026-06-21T00:00:00Z",
        ip: null,
      },
    ],
    error: null,
  });

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: () =>
    Promise.resolve({
      auth: { getUser: () => Promise.resolve({ data: { user: { id: "u1" } } }) },
      from: () => ({ select: () => ({ eq: () => ({ order }) }) }),
    }),
}));
// stub client islands (they import server actions we don't exercise here)
vi.mock("@/components/MarketingToggle", () => ({
  MarketingToggle: ({ initial }: { initial: boolean }) => (
    <div data-testid="marketing-toggle">{initial ? "on" : "off"}</div>
  ),
}));
vi.mock("@/components/DeleteAccountButton", () => ({
  DeleteAccountButton: () => <div data-testid="delete-account" />,
}));

afterEach(() => cleanup());

import AccountPage from "@/app/account/page";

describe("AccountPage", () => {
  it("lists consent history and reflects marketing opt-in state", async () => {
    render(await AccountPage());
    expect(screen.getByText("민감정보(얼굴) 별도 동의")).toBeInTheDocument();
    expect(screen.getByText("마케팅 정보 수신(선택)")).toBeInTheDocument();
    expect(screen.getByTestId("marketing-toggle")).toHaveTextContent("on");
    expect(screen.getByTestId("delete-account")).toBeInTheDocument();
  });
});
