import { it, expect } from "vitest";
import { CREDIT_PACKS, FREE_SIGNUP_CREDITS, STYLE_FAMILIES } from "@/lib/styles";

it("FREE_SIGNUP_CREDITS is 3", () => {
  expect(FREE_SIGNUP_CREDITS).toBe(3);
});

it("STYLE_FAMILIES are the four MVP families", () => {
  expect(STYLE_FAMILIES).toEqual(["business", "editorial", "sns", "fantasy"]);
});

it("CREDIT_PACKS match spec §10 pricing", () => {
  expect(CREDIT_PACKS.starter).toEqual({ id: "starter", name: "스타터 10크레딧", price: 9900, credits: 10 });
  expect(CREDIT_PACKS.value).toEqual({ id: "value", name: "밸류 30크레딧", price: 24900, credits: 30 });
  expect(CREDIT_PACKS.pro).toEqual({ id: "pro", name: "프로 60크레딧", price: 44900, credits: 60 });
});
