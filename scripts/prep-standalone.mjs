/**
 * Makes `.next/standalone/` fully self-contained after `next build`:
 * Next's standalone output ships `server.js` + a traced `node_modules`, but
 * NOT the static assets or `public/`. Copy them in so the folder can be run
 * (or packaged) as-is. Also drop any bundled `.env` so local secrets never
 * ride along into the app.
 */
import { cp, rm, access } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const standalone = path.join(root, ".next", "standalone");

try {
  await access(path.join(standalone, "server.js"));
} catch {
  console.error(
    "No .next/standalone/server.js — run `BUILD_STANDALONE=1 next build` first.",
  );
  process.exit(1);
}

await cp(
  path.join(root, ".next", "static"),
  path.join(standalone, ".next", "static"),
  { recursive: true },
);
await cp(path.join(root, "public"), path.join(standalone, "public"), {
  recursive: true,
});

for (const name of [".env", ".env.local", ".env.production", ".env.development"]) {
  await rm(path.join(standalone, name), { force: true });
}

console.log("prepared .next/standalone (static + public copied, .env stripped)");
