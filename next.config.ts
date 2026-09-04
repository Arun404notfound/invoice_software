import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The desktop (Electron) build sets BUILD_STANDALONE=1 so Next emits a
  // self-contained server at .next/standalone/server.js that Electron can
  // spawn with no node_modules resolution. Web/Vercel builds leave it unset
  // and behave exactly as before.
  ...(process.env.BUILD_STANDALONE === "1"
    ? { output: "standalone" as const }
    : {}),
};

export default nextConfig;
