// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { PackGrid } from "@/app/credits/_PackGrid";

const PACKS = [
  { id: "starter", name: "스타터 10크레딧", price: 9900, credits: 10 },
  { id: "value", name: "밸류 30크레딧", price: 24900, credits: 30 },
];

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("PackGrid", () => {
  it("renders all packs with Korean price", () => {
    render(<PackGrid packs={PACKS} isMobile={false} />);
    expect(screen.getByText("스타터 10크레딧")).toBeTruthy();
    expect(screen.getByText(/9,900원/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "구매" })).toHaveLength(2);
  });

  it("on PC, opens payurl in a popup window", async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) =>
      new Response(JSON.stringify({ payurl: "https://pay.payapp.kr/p/MUL777" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const openMock = vi.fn(() => ({}) as Window);
    vi.stubGlobal("open", openMock);

    render(<PackGrid packs={PACKS} isMobile={false} />);
    fireEvent.click(screen.getAllByRole("button", { name: "구매" })[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      "/api/payments/payapp/create",
      expect.objectContaining({ method: "POST" }),
    ));
    const sentBody = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body));
    expect(sentBody).toEqual({ pack_id: "starter" });
    await waitFor(() => expect(openMock).toHaveBeenCalledWith("https://pay.payapp.kr/p/MUL777", "_blank"));
  });

  it("on mobile, full-redirects to payurl", async () => {
    vi.stubGlobal("fetch", vi.fn(async () =>
      new Response(JSON.stringify({ payurl: "https://pay.payapp.kr/p/MUL888" }), { status: 200 })));
    const assignMock = vi.fn();
    // jsdom location is non-configurable; spy the helper instead via a custom event hook.
    render(<PackGrid packs={PACKS} isMobile redirect={assignMock} />);
    fireEvent.click(screen.getAllByRole("button", { name: "구매" })[1]);
    await waitFor(() => expect(assignMock).toHaveBeenCalledWith("https://pay.payapp.kr/p/MUL888"));
  });
});
