// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { OrderStatus } from "@/app/credits/result/_OrderStatus";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("OrderStatus", () => {
  it("shows pending then transitions to paid via polling", async () => {
    const responses = ["PENDING", "PAID"];
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ status: responses.shift() ?? "PAID" }), { status: 200 })));
    render(<OrderStatus orderId="order-1" initialStatus="PENDING" pollMs={10} />);
    expect(screen.getByText(/결제 확인 중/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/충전이 완료/)).toBeTruthy(), { timeout: 1000 });
  });

  it("renders refunded terminal state without polling", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    render(<OrderStatus orderId="order-2" initialStatus="REFUNDED" pollMs={10} />);
    expect(screen.getByText(/환불/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
