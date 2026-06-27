import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // Server Actions enabled by default in App Router; keep body limit generous for later multipart.
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
