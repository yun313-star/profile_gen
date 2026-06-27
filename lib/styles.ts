import type { CreditPack, StyleFamily } from "@/types/db";

/** Credit packs sold via PayApp (spec §10 recommended starting prices, KRW). */
export const CREDIT_PACKS: Record<string, CreditPack> = {
  starter: { id: "starter", name: "스타터 10크레딧", price: 9900, credits: 10 },
  value: { id: "value", name: "밸류 30크레딧", price: 24900, credits: 30 },
  pro: { id: "pro", name: "프로 60크레딧", price: 44900, credits: 60 },
};

/** Free credits granted on signup (1 credit = 1 image @ 2K; free tier is watermarked 1K). */
export const FREE_SIGNUP_CREDITS = 3 as const;

/** The four paid MVP style families (the 'free' funnel family is internal, not user-selectable here). */
export const STYLE_FAMILIES: ReadonlyArray<Exclude<StyleFamily, "free">> = [
  "business",
  "editorial",
  "sns",
  "fantasy",
];
