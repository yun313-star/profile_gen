import { describe, it, expect } from "vitest";
import config from "@/vercel";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

describe("vercel.ts crons", () => {
  it("is the single deploy config (no vercel.json)", () => {
    expect(existsSync(resolve(process.cwd(), "vercel.json"))).toBe(false);
  });

  it("schedules worker drain, reconcile, reap, and expire", () => {
    const byPath = Object.fromEntries(
      (config.crons ?? []).map((c: { path: string; schedule: string }) => [c.path, c.schedule]),
    );
    expect(byPath["/api/jobs/worker"]).toBe("* * * * *");
    expect(byPath["/api/cron/reconcile"]).toBe("*/10 * * * *");
    expect(byPath["/api/cron/reap"]).toBe("*/5 * * * *");
    expect(byPath["/api/cron/expire"]).toBe("0 * * * *");
    // every schedule is a 5-field cron expression
    for (const c of config.crons ?? []) {
      expect(String(c.schedule).trim().split(/\s+/)).toHaveLength(5);
    }
  });
});
