/**
 * Generates build/icon.png (1024x1024) for electron-builder, which derives
 * the macOS .icns from it. Run via `npm run desktop:icon` (also part of
 * `npm run desktop:mac`).
 *
 * The source artwork is inlined below so this works even though `build/` is
 * git-ignored (Next.js default) — nothing needs to be committed.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const buildDir = path.join(root, "build");
const pngPath = path.join(buildDir, "icon.png");

const SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0f766e"/>
      <stop offset="1" stop-color="#10b981"/>
    </linearGradient>
  </defs>
  <rect width="1024" height="1024" rx="224" fill="url(#bg)"/>
  <rect x="288" y="196" width="448" height="632" rx="40" fill="#ffffff"/>
  <g fill="#0f766e">
    <rect x="356" y="316" width="312" height="40" rx="20"/>
    <rect x="356" y="420" width="312" height="40" rx="20"/>
    <rect x="356" y="524" width="204" height="40" rx="20"/>
  </g>
  <text x="512" y="742" text-anchor="middle" font-family="Helvetica, Arial, sans-serif"
        font-size="150" font-weight="700" fill="#0f766e">TG</text>
</svg>`;

let sharp;
try {
  ({ default: sharp } = await import("sharp"));
} catch {
  console.error(
    "sharp is not installed. Run `npm install`, then retry — or drop a " +
      "1024x1024 PNG at build/icon.png by hand.",
  );
  process.exit(1);
}

await mkdir(buildDir, { recursive: true });
const png = await sharp(Buffer.from(SVG), { density: 384 })
  .resize(1024, 1024, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer();
await writeFile(pngPath, png);
console.log(`wrote ${path.relative(root, pngPath)} (${png.length} bytes)`);
