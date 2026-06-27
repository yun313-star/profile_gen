import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConsentType } from "@/types/db";

/** PIPA unbundled mandatory consents (must all be present to access /create). */
export const REQUIRED_CONSENTS: ConsentType[] = ["tos", "privacy", "sensitive_face", "own_face"];
/** Optional consents (do not gate access). */
export const OPTIONAL_CONSENTS: ConsentType[] = ["marketing"];

/** Bump this string when consent copy/scope changes; new version forces re-consent. */
export const CONSENT_VERSION = "2026-06-27";

/** Korean labels for the consent UI (spec §9 PIPA). */
export const CONSENT_LABELS: Record<ConsentType, { title: string; required: boolean }> = {
  tos: { title: "[필수] 이용약관 동의", required: true },
  privacy: {
    title: "[필수] 개인정보 수집·이용 동의 (항목: 셀카·얼굴 / 목적: AI 프로필 생성 / 보유: 생성 직후 파기)",
    required: true,
  },
  sensitive_face: {
    title: "[필수] 얼굴 정보(민감정보 준함) 처리에 대한 별도 동의",
    required: true,
  },
  own_face: { title: "[필수] 본인 얼굴만 업로드함을 확인", required: true },
  marketing: { title: "[선택] 마케팅 정보 수신 동의", required: false },
};

/** Returns the distinct consent types the user has already agreed to (filters by current CONSENT_VERSION only). */
export async function getUserConsents(sb: SupabaseClient, userId: string): Promise<ConsentType[]> {
  const { data, error } = await sb.from("consents").select("type").eq("user_id", userId).eq("version", CONSENT_VERSION);
  if (error) throw new Error(`getUserConsents: ${error.message}`);
  const set = new Set<ConsentType>();
  for (const row of (data ?? []) as { type: ConsentType }[]) set.add(row.type);
  return [...set];
}

/** True iff every REQUIRED_CONSENTS type is present in `agreed`. */
export function hasRequiredConsents(agreed: ConsentType[]): boolean {
  const set = new Set(agreed);
  return REQUIRED_CONSENTS.every((t) => set.has(t));
}

/** Insert one consent row per agreed type (append-only audit, with version + IP). */
export async function recordConsents(
  sb: SupabaseClient,
  args: { userId: string; types: ConsentType[]; ip: string | null },
): Promise<void> {
  if (args.types.length === 0) return;
  const rows = args.types.map((type) => ({
    user_id: args.userId,
    type,
    version: CONSENT_VERSION,
    ip: args.ip,
  }));
  const { error } = await sb.from("consents").insert(rows);
  if (error) throw new Error(`recordConsents: ${error.message}`);
}
