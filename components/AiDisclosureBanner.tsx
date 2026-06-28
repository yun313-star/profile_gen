import { AI_DISCLOSURE_TEXT } from "@/lib/legal";

export function AiDisclosureBanner() {
  return (
    <div
      role="note"
      data-testid="ai-disclosure-banner"
      className="w-full bg-amber-50 px-4 py-2 text-center text-sm text-amber-900"
    >
      {AI_DISCLOSURE_TEXT}
    </div>
  );
}
