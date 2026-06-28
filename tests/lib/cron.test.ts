// @vitest-environment node
import { it, expect, beforeEach } from "vitest";
import { requireCron } from "@/lib/cron";

function reqWith(auth?: string) {
  return new Request("http://t/api/cron/x", auth ? { headers: { authorization: auth } } : {});
}

beforeEach(() => {
  process.env.CRON_SECRET = "s3cr3t";
});

it("authorizes a correct bearer (returns null)", () => {
  expect(requireCron(reqWith("Bearer s3cr3t"))).toBeNull();
});

it("rejects a wrong bearer with 401", () => {
  const r = requireCron(reqWith("Bearer wrong"));
  expect(r?.status).toBe(401);
});

it("rejects a missing header with 401", () => {
  const r = requireCron(reqWith(undefined));
  expect(r?.status).toBe(401);
});

it("FAILS CLOSED with 500 when CRON_SECRET is unset (no 'Bearer undefined' bypass)", () => {
  delete process.env.CRON_SECRET;
  // An attacker sending literally "Bearer undefined" must NOT be authorized.
  expect(requireCron(reqWith("Bearer undefined"))?.status).toBe(500);
  expect(requireCron(reqWith(undefined))?.status).toBe(500);
});
