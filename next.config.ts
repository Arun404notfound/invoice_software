import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the workspace root. The build machine may have a stray
  // package-lock.json further up the tree (e.g. in the home dir) that Next
  // would otherwise auto-select as the root, mislocating the build output.
  turbopack: { root: process.cwd() },

  // The desktop (Electron) build sets BUILD_STANDALONE=1 so Next emits a
  // self-contained server at .next/standalone/server.js that Electron can
  // spawn with no node_modules resolution. Web/Vercel builds leave it unset
  // and behave exactly as before.
  ...(process.env.BUILD_STANDALONE === "1"
    ? { output: "standalone" as const }
    : {}),
};

export default nextConfig;
