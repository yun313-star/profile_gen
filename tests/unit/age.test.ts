import { describe, it, expect } from "vitest";
import { MIN_AGE, ageFromBirthdate, isAgeAllowed } from "@/lib/age";

const today = new Date("2026-06-27T00:00:00Z");

it("MIN_AGE is the legal 14 gate (spec §9)", () => {
  expect(MIN_AGE).toBe(14);
});

it("ageFromBirthdate computes full years, not yet had birthday this year", () => {
  expect(ageFromBirthdate("2012-12-01", today)).toBe(13); // birthday later in 2026
  expect(ageFromBirthdate("2012-06-27", today)).toBe(14); // birthday today
  expect(ageFromBirthdate("2000-01-01", today)).toBe(26);
});

it("isAgeAllowed blocks < 14, allows >= 14", () => {
  expect(isAgeAllowed("2012-12-01", today)).toBe(false); // turns 14 after today => 13
  expect(isAgeAllowed("2012-06-27", today)).toBe(true); // exactly 14 today
  expect(isAgeAllowed("2013-01-01", today)).toBe(false); // 13
  expect(isAgeAllowed("1990-05-05", today)).toBe(true);
});
