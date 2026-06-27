import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));

const createServerClient = vi.fn(() => ({ __kind: "server" }));
const createBrowserClient = vi.fn(() => ({ __kind: "browser" }));

vi.mock("@supabase/ssr", () => ({ createServerClient, createBrowserClient }));
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({ getAll: () => [], set: () => {} })),
}));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://proj.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-key";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-key";
});

it("createServerSupabase uses url + anon key", async () => {
  const { createServerSupabase } = await import("@/lib/supabase/server");
  await createServerSupabase();
  expect(createServerClient).toHaveBeenCalledWith(
    "https://proj.supabase.co",
    "anon-key",
    expect.objectContaining({ cookies: expect.any(Object) }),
  );
});

it("createBrowserSupabase uses url + anon key", async () => {
  const { createBrowserSupabase } = await import("@/lib/supabase/browser");
  createBrowserSupabase();
  expect(createBrowserClient).toHaveBeenCalledWith("https://proj.supabase.co", "anon-key");
});

it("createServiceSupabase uses service-role key with persistSession false", async () => {
  const { createServiceSupabase } = await import("@/lib/supabase/service");
  createServiceSupabase();
  expect(createServerClient).toHaveBeenCalledWith(
    "https://proj.supabase.co",
    "service-key",
    expect.objectContaining({ auth: { persistSession: false, autoRefreshToken: false } }),
  );
});
