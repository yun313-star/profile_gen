// Vercel project configuration. Single source of truth (no vercel.json).
// Phase 1 keeps this framework-only. Cron schedules are added/finalized in Phase 4;
// the worker maxDuration is a route segment export (Phase 2), NOT a functions entry here.
const config = {
  $schema: "https://openapi.vercel.sh/vercel.json",
  framework: "nextjs",
} as const;

export default config;
