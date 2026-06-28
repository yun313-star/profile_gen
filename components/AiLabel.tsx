import { AI_LABEL_TEXT } from "@/lib/legal";

export function AiLabel({ className = "" }: { className?: string }) {
  return (
    <span
      data-testid="ai-label"
      className={`inline-flex items-center rounded-md bg-black/70 px-2 py-0.5 text-xs font-medium text-white ${className}`}
    >
      {AI_LABEL_TEXT}
    </span>
  );
}
