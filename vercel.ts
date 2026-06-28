// Vercel project configuration. Single source of truth (no vercel.json).
// Phase 1 scaffolded this framework-only; Phase 4 owns/finalizes the cron block.
// The worker function timeout is a Next.js route-segment export
// (`export const maxDuration = 300`) on app/api/jobs/worker/route.ts, NOT here.
// Vercel attaches `Authorization: Bearer ${CRON_SECRET}` to cron invocations,
// satisfying the guard in every cron route.
const config = {
  $schema: "https://openapi.vercel.sh/vercel.json",
  framework: "nextjs", // retained from the Phase 1 scaffold; do not drop
  crons: [
    { path: "/api/jobs/worker", schedule: "* * * * *" }, // every-minute drain backstop
    { path: "/api/cron/reconcile", schedule: "*/10 * * * *" },
    { path: "/api/cron/reap", schedule: "*/5 * * * *" },
    { path: "/api/cron/expire", schedule: "0 * * * *" },
  ],
};

export default config;
